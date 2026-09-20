import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { hashPassword, publicProfile, verifyPassword } from "./auth";
import { getLlmProvider } from "./llm";
import { publish } from "./realtime";
import { loadStore, mutateStore, uploadsDir } from "./store";
import {
  decideTopicTransition,
  extractFromPlainText,
  extractTopicsFromSections,
  relateTopics,
  stripHtml,
} from "./services/knowledge";
import { findBlockedPhrase, rateLimitOk, sanitizeAiContent } from "./services/moderation";
import {
  applyTopicEnergy,
  orchestrate,
  typingDurationMs,
  type OrchestratorDecision,
} from "./services/orchestrator";
import { parsePersonaWorkbook, toPoolRecords } from "./services/persona-import";
import { eligiblePoolRecords, pickUniquePersonas } from "./services/persona-import";
import type {
  AiPersona,
  KnowledgeChunk,
  Message,
  PersonaPoolRecord,
  PlatformSettings,
  Profile,
  Room,
  StoreShape,
  Topic,
} from "./types";
import { minutesSince, nowIso, sampleN, truncate, wordOverlapScore } from "./utils";

const rateBuckets = new Map<string, number[]>();
const roomQueues = new Map<string, Promise<void>>();

function enqueue(roomId: string, task: () => Promise<void>) {
  const prev = roomQueues.get(roomId) ?? Promise.resolve();
  const next = prev.then(task).catch((err) => {
    console.error("room queue", roomId, err);
  });
  roomQueues.set(roomId, next);
  return next;
}

function id() {
  return crypto.randomUUID();
}

export function getSettings() {
  return loadStore().settings;
}

export function updateSettings(patch: Partial<PlatformSettings>, actorId: string) {
  return mutateStore((s) => {
    s.settings = { ...s.settings, ...patch };
    s.moderationEvents.push({
      id: id(),
      createdAt: nowIso(),
      actorUserId: actorId,
      targetUserId: null,
      roomId: null,
      action: "update_settings",
      reason: "Admin updated platform settings",
      details: patch as Record<string, unknown>,
    });
    return s.settings;
  });
}

export async function registerUser(input: {
  email: string;
  username: string;
  displayName: string;
  password: string;
}) {
  const email = input.email.toLowerCase().trim();
  const username = input.username.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (username.length < 3) throw new Error("Username must be at least 3 characters");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  const store = loadStore();
  if (store.profiles.some((p) => p.email === email)) throw new Error("Email already registered");
  if (store.profiles.some((p) => p.username === username)) throw new Error("Username taken");
  const profile: Profile = {
    id: id(),
    username,
    displayName: input.displayName.trim() || username,
    email,
    passwordHash: await hashPassword(input.password),
    avatarUrl: null,
    bio: "",
    isAdmin: store.profiles.length === 0,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    mutedUntil: null,
    bannedAt: null,
    banReason: null,
  };
  mutateStore((s) => {
    s.profiles.push(profile);
    for (const room of s.rooms.filter((r) => r.roomType === "public")) {
      s.members.push({
        roomId: room.id,
        userId: profile.id,
        role: "member",
        joinedAt: nowIso(),
        lastReadAt: nowIso(),
      });
    }
  });
  return profile;
}

export async function loginUser(emailOrUser: string, password: string) {
  const key = emailOrUser.toLowerCase().trim();
  const profile = loadStore().profiles.find((p) => p.email === key || p.username === key);
  if (!profile) throw new Error("Invalid credentials");
  if (profile.bannedAt) throw new Error("This account is banned");
  const ok = await verifyPassword(password, profile.passwordHash);
  if (!ok) throw new Error("Invalid credentials");
  touchPresence(profile.id);
  return profile;
}

export function getProfile(id: string) {
  return loadStore().profiles.find((p) => p.id === id) ?? null;
}

export function listRoomsForUser(userId: string) {
  const s = loadStore();
  const memberIds = new Set(s.members.filter((m) => m.userId === userId).map((m) => m.roomId));
  return s.rooms
    .filter((r) => r.roomType === "public" || memberIds.has(r.id))
    .map((room) => serializeRoom(room, userId, s));
}

export function getRoomForUser(roomId: string, userId: string) {
  const s = loadStore();
  const room = s.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const member = s.members.some((m) => m.roomId === roomId && m.userId === userId);
  if (room.roomType === "private" && !member) return null;
  if (room.roomType === "public" && !member) {
    mutateStore((st) => {
      st.members.push({
        roomId,
        userId,
        role: "member",
        joinedAt: nowIso(),
        lastReadAt: nowIso(),
      });
    });
  }
  ensureRoomPersonas(roomId);
  return serializeRoom(loadStore().rooms.find((r) => r.id === roomId)!, userId, loadStore());
}

function serializeRoom(room: Room, userId: string, s: StoreShape) {
  const member = s.members.find((m) => m.roomId === room.id && m.userId === userId);
  const messages = s.messages.filter((m) => m.roomId === room.id);
  const unread = member
    ? messages.filter((m) => m.createdAt > member.lastReadAt && m.senderUserId !== userId).length
    : 0;
  const last = messages[messages.length - 1];
  const presence = presenceForRoom(room.id, s);
  const conv = s.conversation.find((c) => c.roomId === room.id);
  const topic = s.topics.find((t) => t.id === conv?.currentTopicId);
  return {
    ...room,
    unread,
    lastMessage: last
      ? { id: last.id, content: truncate(last.content, 90), createdAt: last.createdAt }
      : null,
    onlineCount: presence.onlineCount,
    humanOnline: presence.humans,
    aiOnline: presence.ai,
    currentTopic: topic ? { id: topic.id, name: topic.name } : null,
    activityState: conv?.activityState ?? "quiet",
  };
}

export function presenceForRoom(roomId: string, s = loadStore()) {
  const humans = s.profiles.filter((p) => {
    if (p.bannedAt) return false;
    const mins = minutesSince(p.lastSeenAt);
    return mins < 8 && s.members.some((m) => m.roomId === roomId && m.userId === p.id);
  }).length;
  const ai = s.assignments.filter(
    (a) => a.roomId === roomId && !a.activeUntil && a.presence !== "offline",
  ).length;
  return { humans, ai, onlineCount: humans + ai };
}

export function listMessages(roomId: string, limit = 80) {
  const s = loadStore();
  const msgs = s.messages.filter((m) => m.roomId === roomId).slice(-limit);
  return msgs.map((m) => hydrateMessage(m, s));
}

function hydrateMessage(m: Message, s: StoreShape) {
  const user = m.senderUserId ? s.profiles.find((p) => p.id === m.senderUserId) : null;
  const persona = m.senderAiPersonaId ? s.aiPersonas.find((p) => p.id === m.senderAiPersonaId) : null;
  return {
    ...m,
    sender: user
      ? { kind: "human" as const, ...publicProfile(user) }
      : persona
        ? {
            kind: "ai" as const,
            id: persona.id,
            displayName: persona.displayName,
            username: persona.sourcePersonaId,
            isAi: true,
            aiDisclosureLabel: persona.aiDisclosureLabel,
            personality: persona.personality,
            region: persona.region,
          }
        : { kind: "system" as const, displayName: "System" },
  };
}

export function touchPresence(userId: string) {
  mutateStore((s) => {
    const p = s.profiles.find((x) => x.id === userId);
    if (p) p.lastSeenAt = nowIso();
  });
}

export function markRead(roomId: string, userId: string) {
  mutateStore((s) => {
    const m = s.members.find((x) => x.roomId === roomId && x.userId === userId);
    if (m) m.lastReadAt = nowIso();
  });
  publish({ type: "unread_count_update", roomId, payload: { userId, unread: 0 } });
}

export function setHumanTyping(roomId: string, userId: string, typing: boolean) {
  const profile = getProfile(userId);
  mutateStore((s) => {
    s.typing = s.typing.filter((t) => !(t.roomId === roomId && t.actorId === userId));
    if (typing && profile) {
      s.typing.push({
        roomId,
        actorId: userId,
        isAi: false,
        displayName: profile.displayName,
        startedAt: nowIso(),
      });
    }
  });
  publish({
    type: typing ? "typing_start" : "typing_stop",
    roomId,
    payload: { actorId: userId, isAi: false, displayName: profile?.displayName },
  });
}

export function typingForRoom(roomId: string) {
  const cutoff = Date.now() - 8000;
  return loadStore().typing.filter(
    (t) => t.roomId === roomId && new Date(t.startedAt).getTime() > cutoff,
  );
}

const postSchema = z.object({
  content: z.string().min(1).max(4000),
  replyToMessageId: z.string().nullable().optional(),
});

export async function postHumanMessage(roomId: string, userId: string, raw: unknown) {
  const { content, replyToMessageId } = postSchema.parse(raw);
  const profile = getProfile(userId);
  if (!profile) throw new Error("Unknown user");
  if (profile.bannedAt) throw new Error("Banned");
  if (profile.mutedUntil && new Date(profile.mutedUntil).getTime() > Date.now()) {
    throw new Error("You are muted");
  }
  const bucket = rateBuckets.get(userId) ?? [];
  const rl = rateLimitOk(bucket, 20_000, 8);
  if (!rl.ok) throw new Error("You are sending messages too quickly");
  rateBuckets.set(userId, [...rl.recent, Date.now()]);
  const blocked = findBlockedPhrase(content, getSettings().blockedPhrases);
  if (blocked) {
    mutateStore((s) => {
      s.moderationEvents.push({
        id: id(),
        createdAt: nowIso(),
        actorUserId: null,
        targetUserId: userId,
        roomId,
        action: "block_phrase",
        reason: `Blocked phrase: ${blocked}`,
        details: { content },
      });
    });
    throw new Error("Message blocked by moderation filters");
  }

  const message = insertMessage({
    roomId,
    senderUserId: userId,
    senderAiPersonaId: null,
    content,
    replyToMessageId: replyToMessageId ?? null,
    metadata: { origin: "human" },
  });

  updateConversationAfterMessage(roomId, true);
  setHumanTyping(roomId, userId, false);
  markRead(roomId, userId);

  enqueue(roomId, async () => {
    await runOrchestration(roomId, "human_message", message.id);
  });

  return hydrateMessage(message, loadStore());
}

function assertSender(m: Omit<Message, "id" | "createdAt">) {
  const hasUser = Boolean(m.senderUserId);
  const hasAi = Boolean(m.senderAiPersonaId);
  if (hasUser === hasAi) {
    throw new Error("Message must have exactly one sender (user or AI persona)");
  }
}

function insertMessage(
  partial: Omit<Message, "id" | "createdAt" | "messageType"> & { messageType?: Message["messageType"] },
) {
  const message: Message = {
    id: id(),
    createdAt: nowIso(),
    messageType: partial.messageType ?? "text",
    roomId: partial.roomId,
    senderUserId: partial.senderUserId,
    senderAiPersonaId: partial.senderAiPersonaId,
    content: partial.content,
    replyToMessageId: partial.replyToMessageId,
    metadata: partial.metadata,
  };
  assertSender(message);
  mutateStore((s) => {
    s.messages.push(message);
    const conv = s.conversation.find((c) => c.roomId === message.roomId);
    if (conv) {
      conv.lastMessageAt = message.createdAt;
      if (message.senderUserId) conv.lastHumanMessageAt = message.createdAt;
      if (message.senderAiPersonaId) conv.lastAiMessageAt = message.createdAt;
      conv.topicMessageCount += 1;
      conv.updatedAt = message.createdAt;
    }
  });
  publish({
    type: "new_message",
    roomId: message.roomId,
    payload: hydrateMessage(message, loadStore()),
  });
  return message;
}

function updateConversationAfterMessage(roomId: string, human: boolean) {
  mutateStore((s) => {
    const conv = s.conversation.find((c) => c.roomId === roomId);
    if (!conv) return;
    conv.topicEnergy = applyTopicEnergy({
      energy: conv.topicEnergy,
      humanSpoke: human,
      aiSpoke: !human,
      repeatedTopic: conv.topicMessageCount > 5,
    });
    conv.activityScore = clamp01(conv.activityScore + (human ? 0.12 : -0.03));
  });
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function retrieveKnowledge(query: string, limit = 5) {
  const s = loadStore();
  return s.chunks
    .map((c) => ({
      chunk: c,
      score: wordOverlapScore(query, `${c.title}\n${c.content}`) + (c.kind === "warning" ? 0.02 : 0),
    }))
    .filter((x) => x.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.chunk);
}

function ensureRoomPersonas(roomId: string) {
  mutateStore((s) => {
    const desired = Math.min(s.settings.maxActiveAiPerRoom, Math.max(5, Math.min(8, s.personaPool.length)));
    const active = s.assignments.filter((a) => a.roomId === roomId && !a.activeUntil);
    const assignedPool = new Set(
      active.map((a) => s.aiPersonas.find((p) => p.id === a.personaId)?.poolRecordId),
    );
    const needed = Math.max(0, Math.min(s.settings.maxActiveAiPerRoom, desired) - active.length);
    const recentSource = s.assignments
      .filter((a) => a.roomId === roomId)
      .map((a) => ({
        poolSourceId: s.aiPersonas.find((p) => p.id === a.personaId)?.sourcePersonaId ?? "",
        assignedAt: a.assignedAt,
      }));
    const eligible = eligiblePoolRecords(
      s.personaPool.filter((p) => !assignedPool.has(p.id)),
      recentSource,
      s.settings.personaReassignmentHours,
    );
    const created = pickUniquePersonas(eligible, needed);
    for (const rec of created) {
      const persona = upsertPersonaFromPool(s, rec);
      s.assignments.push({
        id: id(),
        roomId,
        personaId: persona.id,
        assignedAt: nowIso(),
        activeUntil: null,
        activityState: "quiet",
        lastActiveAt: null,
        presence: Math.random() < 0.7 ? "online" : "idle",
        presenceJitter: Math.random(),
      });
      s.botEvents.push({
        id: id(),
        roomId,
        createdAt: nowIso(),
        decision: "wait",
        speakerPersonaId: persona.id,
        reason: "Assigned AI participant from persona pool",
        details: { sourcePersonaId: rec.sourcePersonaId, displayName: rec.displayName },
      });
    }
    if (!s.conversation.some((c) => c.roomId === roomId)) {
      const topic = s.topics.find((t) => t.active) ?? null;
      s.conversation.push({
        roomId,
        currentTopicId: topic?.id ?? null,
        topicStartedAt: nowIso(),
        topicMessageCount: 0,
        topicEnergy: 0.72,
        lastMessageAt: s.messages.filter((m) => m.roomId === roomId).at(-1)?.createdAt ?? null,
        lastHumanMessageAt: null,
        lastAiMessageAt: null,
        activityScore: 0.4,
        activityState: "quiet",
        conversationSummary: "Development room waiting for conversation.",
        unresolvedQuestions: [],
        topicHistory: topic ? [topic.id] : [],
        updatedAt: nowIso(),
      });
    }
  });
}

function upsertPersonaFromPool(s: StoreShape, rec: PersonaPoolRecord): AiPersona {
  const existing = s.aiPersonas.find((p) => p.poolRecordId === rec.id);
  if (existing) return existing;
  const persona: AiPersona = {
    id: id(),
    sourcePersonaId: rec.sourcePersonaId,
    poolRecordId: rec.id,
    displayName: rec.displayName,
    region: rec.region,
    experienceLevel: rec.experienceLevel,
    personality: rec.personality,
    communicationStyle: rec.communicationStyle,
    knowledgeLevel: rec.knowledgeLevel,
    activityLevel: rec.activityLevel,
    aiDisclosureLabel: "AI",
    active: true,
    createdAt: nowIso(),
  };
  s.aiPersonas.push(persona);
  s.personaMemory.push({
    personaId: persona.id,
    lastRoomId: null,
    lastActiveAt: null,
    recentTopicIds: [],
    recentMessageIds: [],
  });
  return persona;
}

function applyTransition(roomId: string, kind: "stay" | "related" | "new" | null) {
  if (!kind || kind === "stay") return;
  mutateStore((s) => {
    const conv = s.conversation.find((c) => c.roomId === roomId);
    if (!conv) return;
    const current = s.topics.find((t) => t.id === conv.currentTopicId);
    const active = s.topics.filter((t) => t.active);
    let next: Topic | undefined;
    if (kind === "related" && current) {
      const related = active.filter((t) => current.relatedTopicIds.includes(t.id) && t.id !== current.id);
      next = related[Math.floor(Math.random() * related.length)];
    }
    if (!next) {
      const others = active.filter((t) => t.id !== conv.currentTopicId);
      next = others[Math.floor(Math.random() * others.length)];
    }
    if (!next) return;
    conv.currentTopicId = next.id;
    conv.topicStartedAt = nowIso();
    conv.topicMessageCount = 0;
    conv.topicEnergy = 0.7;
    conv.topicHistory = [...conv.topicHistory.slice(-12), next.id];
    conv.updatedAt = nowIso();
  });
}

async function generatePersonaReply(opts: {
  roomId: string;
  persona: AiPersona;
  intent: OrchestratorDecision["intent"];
  humanMessage?: Message;
}) {
  const s = loadStore();
  const conv = s.conversation.find((c) => c.roomId === opts.roomId);
  const topic = s.topics.find((t) => t.id === conv?.currentTopicId);
  const recent = s.messages.filter((m) => m.roomId === opts.roomId).slice(-12);
  const query = opts.humanMessage?.content || topic?.name || conv?.conversationSummary || "community";
  const chunks = retrieveKnowledge(query);
  const transcript = recent
    .map((m) => {
      const name = m.senderUserId
        ? s.profiles.find((p) => p.id === m.senderUserId)?.displayName
        : s.aiPersonas.find((p) => p.id === m.senderAiPersonaId)?.displayName;
      return `${name ?? "Someone"}: ${m.content}`;
    })
    .join("\n");

  const system = `You are an AI participant in Harbor Chat. You MUST be clearly an AI persona simulation, never a real person.
Persona name: ${opts.persona.displayName} (always labeled AI)
Region: ${opts.persona.region}
Experience: ${opts.persona.experienceLevel}
Personality: ${opts.persona.personality}
Style: ${opts.persona.communicationStyle}
Knowledge: ${opts.persona.knowledgeLevel}

Rules:
- Stay short or medium. Natural chat, not an essay.
- Do not invent platform features, payments, earnings, eligibility, policies, procedures, deadlines, or guarantees.
- If it is not in KNOWLEDGE BASE, say it is not documented and point to official docs/support.
- Do not claim personal real-world financial success.
- Do not impersonate humans or invent that a real person said something.
- Avoid agreement loops, ending every line with a question, and excessive emoji.
- Current intent: ${opts.intent}
- Current topic: ${topic?.name ?? "none"} — ${topic?.description ?? ""}
- Conversation summary: ${conv?.conversationSummary ?? ""}`;

  const user = `KNOWLEDGE BASE
${chunks.map((c) => `- ${c.title}: ${c.content}`).join("\n") || "(empty — refuse platform specifics)"}

RECENT TRANSCRIPT
${transcript || "(empty)"}

${opts.humanMessage ? `HUMAN MESSAGE: ${opts.humanMessage.content}` : "No new human message. You may open a low-volume, documentation-grounded thought or stay light. Do not spam."}

Write one chat message only.`;

  const settings = s.settings;
  const provider = getLlmProvider(settings.aiProvider);
  const result = await provider.generate({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: settings.temperature,
    maxTokens: 180,
    model: settings.aiModel,
  });

  mutateStore((st) => {
    st.tokenUsage.push({
      id: id(),
      createdAt: nowIso(),
      roomId: opts.roomId,
      provider: result.provider,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      kind: opts.intent,
    });
  });

  return sanitizeAiContent(result.text, settings.maxBotResponseChars);
}

async function emitAiMessage(roomId: string, personaId: string, content: string, intent: string) {
  const s = loadStore();
  const persona = s.aiPersonas.find((p) => p.id === personaId);
  if (!persona) return;
  const duration = typingDurationMs(content.length, s.settings);
  mutateStore((st) => {
    st.typing = st.typing.filter((t) => t.actorId !== personaId);
    st.typing.push({
      roomId,
      actorId: personaId,
      isAi: true,
      displayName: persona.displayName,
      startedAt: nowIso(),
    });
  });
  publish({
    type: "typing_start",
    roomId,
    payload: { actorId: personaId, isAi: true, displayName: persona.displayName, aiDisclosureLabel: "AI" },
  });
  await sleep(duration);
  mutateStore((st) => {
    st.typing = st.typing.filter((t) => t.actorId !== personaId);
    const mem = st.personaMemory.find((m) => m.personaId === personaId);
    if (mem) {
      mem.lastRoomId = roomId;
      mem.lastActiveAt = nowIso();
    }
    const a = st.assignments.find((x) => x.roomId === roomId && x.personaId === personaId);
    if (a) {
      a.lastActiveAt = nowIso();
      a.presence = "online";
    }
  });
  publish({ type: "typing_stop", roomId, payload: { actorId: personaId, isAi: true } });
  insertMessage({
    roomId,
    senderUserId: null,
    senderAiPersonaId: personaId,
    content,
    replyToMessageId: null,
    metadata: { origin: "ai", intent },
  });
  updateConversationAfterMessage(roomId, false);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runOrchestration(
  roomId: string,
  trigger: "human_message" | "tick" | "simulation",
  humanMessageId?: string,
) {
  ensureRoomPersonas(roomId);
  const s = loadStore();
  const room = s.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const state = s.conversation.find((c) => c.roomId === roomId);
  if (!state) return null;
  const assignments = s.assignments.filter((a) => a.roomId === roomId);
  const personas = s.aiPersonas.filter((p) => assignments.some((a) => a.personaId === p.id));
  const recent = s.messages.filter((m) => m.roomId === roomId).slice(-20);
  const presence = presenceForRoom(roomId, s);
  const lastHuman = humanMessageId
    ? s.messages.find((m) => m.id === humanMessageId)
    : recent.filter((m) => m.senderUserId).at(-1);
  const typingHumans = s.typing.some((t) => t.roomId === roomId && !t.isAi);

  const decision = orchestrate({
    room,
    state,
    settings: s.settings,
    recent,
    topics: s.topics,
    assignments,
    personas,
    humansOnline: presence.humans,
    humansRecentlyActive: s.profiles.filter((p) => minutesSince(p.lastSeenAt) < 30).length,
    humanIsTyping: typingHumans,
    lastHumanMessage: lastHuman,
    trigger,
  });

  mutateStore((st) => {
    const conv = st.conversation.find((c) => c.roomId === roomId);
    if (conv) {
      conv.activityState = decision.nextActivityState;
      conv.updatedAt = nowIso();
      if (recent.length >= 4) {
        conv.conversationSummary = truncate(
          recent
            .slice(-6)
            .map((m) => m.content)
            .join(" / "),
          280,
        );
      }
    }
    st.botEvents.push({
      id: id(),
      roomId,
      createdAt: nowIso(),
      decision: decision.intent,
      speakerPersonaId: decision.speakerPersonaIds[0] ?? null,
      reason: decision.reason,
      details: { ...decision, trigger },
    });
    st.analytics.push({
      id: id(),
      createdAt: nowIso(),
      kind: "orchestration",
      payload: { roomId, intent: decision.intent, act: decision.act, trigger },
    });
  });

  publish({
    type: "bot_event",
    roomId,
    payload: decision,
  });
  publish({
    type: "room_activity_update",
    roomId,
    payload: { activityState: decision.nextActivityState },
  });

  if (decision.transition && decision.transition !== "stay") {
    const conv = loadStore().conversation.find((c) => c.roomId === roomId);
    if (conv) {
      const t = decideTopicTransition({
        energy: conv.topicEnergy,
        messageCount: conv.topicMessageCount,
        minutesOnTopic: minutesSince(conv.topicStartedAt),
        relatedAvailable: Boolean(
          s.topics.find((x) => x.id === conv.currentTopicId)?.relatedTopicIds.length,
        ),
        relatedProbability: s.settings.relatedTopicProbability,
        newProbability: s.settings.newTopicProbability,
      });
      applyTransition(roomId, decision.transition === "related" || decision.transition === "new" ? decision.transition : t);
    }
  }

  if (!decision.act) return decision;

  await sleep(decision.delayMs);
  const speakers = decision.speakerPersonaIds.slice(0, s.settings.maxAiResponsesPerEvent);
  for (const personaId of speakers) {
    const persona = loadStore().aiPersonas.find((p) => p.id === personaId);
    if (!persona) continue;
    const text = await generatePersonaReply({
      roomId,
      persona,
      intent: decision.intent,
      humanMessage: trigger === "human_message" ? lastHuman : undefined,
    });
    await emitAiMessage(roomId, personaId, text, decision.intent);
  }
  return decision;
}

export function wanderPresence() {
  mutateStore((s) => {
    for (const a of s.assignments) {
      if (a.activeUntil) continue;
      const roll = Math.random();
      if (roll < 0.04) a.presence = "away";
      else if (roll < 0.1) a.presence = "idle";
      else if (roll < 0.16) a.presence = "offline";
      else if (roll < 0.55) a.presence = "online";
    }
  });
  for (const room of loadStore().rooms) {
    publish({
      type: "presence_update",
      roomId: room.id,
      payload: presenceForRoom(room.id),
    });
  }
}

export async function tickActivity() {
  wanderPresence();
  const s = loadStore();
  for (const room of s.rooms.filter((r) => r.isActive)) {
    enqueue(room.id, async () => {
      await runOrchestration(room.id, "tick");
    });
  }
}

export async function importPersonasFromBuffer(
  buffer: Buffer,
  uploadedBy: string,
  confirmed: boolean,
) {
  if (!confirmed) {
    throw new Error("Administrator must confirm imported names are display-name data only, not real user accounts");
  }
  const rows = parsePersonaWorkbook(buffer, getSettings().columnMap);
  if (!rows.length) throw new Error("No persona rows found");
  const batchId = id();
  const records = toPoolRecords(rows, batchId, nowIso());
  mutateStore((s) => {
    s.personaPool = records;
    s.settings.personaImportConfirmed = true;
    s.moderationEvents.push({
      id: id(),
      createdAt: nowIso(),
      actorUserId: uploadedBy,
      targetUserId: null,
      roomId: null,
      action: "import_personas",
      reason: "Replaced persona pool from Excel",
      details: { count: records.length, batchId },
    });
  });
  for (const room of loadStore().rooms) {
    mutateStore((s) => {
      for (const a of s.assignments.filter((x) => x.roomId === room.id && !x.activeUntil)) {
        a.activeUntil = nowIso();
      }
    });
    ensureRoomPersonas(room.id);
  }
  return { count: records.length, batchId };
}

export async function ingestDocument(opts: {
  filename: string;
  mime: string;
  buffer: Buffer;
  uploadedBy: string;
}) {
  const ext = path.extname(opts.filename).toLowerCase();
  const storageName = `${id()}${ext}`;
  const storagePath = path.join(uploadsDir(), storageName);
  fs.writeFileSync(storagePath, opts.buffer);
  const docId = id();
  mutateStore((s) => {
    s.documents.push({
      id: docId,
      filename: opts.filename,
      fileType: ext.replace(".", "") || opts.mime,
      storagePath,
      status: "processing",
      uploadedBy: opts.uploadedBy,
      createdAt: nowIso(),
      error: null,
      confirmation: true,
    });
  });
  try {
    const text = await extractFileText(ext, opts.buffer);
    const sections = extractFromPlainText(text);
    const topicDrafts = extractTopicsFromSections(sections);
    const relatedIdx = relateTopics(topicDrafts);
    mutateStore((s) => {
      s.chunks = s.chunks.filter((c) => c.documentId !== docId);
      const createdTopics: Topic[] = topicDrafts.map((t, i) => ({
        id: id(),
        name: t.name,
        description: t.description,
        sourceDocumentId: docId,
        priority: t.priority,
        tags: t.tags,
        relatedTopicIds: [],
        allowedAngles: t.allowedAngles,
        active: true,
      }));
      createdTopics.forEach((t, i) => {
        t.relatedTopicIds = relatedIdx[i]!.map((j) => createdTopics[j]!.id);
      });
      const other = s.topics.filter((t) => t.sourceDocumentId !== docId);
      s.topics = [...other, ...createdTopics];
      const chunks: KnowledgeChunk[] = sections.map((sec, i) => ({
        id: id(),
        documentId: docId,
        title: sec.title,
        content: sec.content.slice(0, 4000),
        topicId: createdTopics[Math.min(i, createdTopics.length - 1)]?.id ?? null,
        kind: sec.kind,
        embedding: null,
        metadata: { tags: sec.tags },
      }));
      s.chunks.push(...chunks);
      const doc = s.documents.find((d) => d.id === docId);
      if (doc) doc.status = "ready";
    });
    return loadStore().documents.find((d) => d.id === docId);
  } catch (e) {
    mutateStore((s) => {
      const doc = s.documents.find((d) => d.id === docId);
      if (doc) {
        doc.status = "failed";
        doc.error = e instanceof Error ? e.message : "Ingestion failed";
      }
    });
    throw e;
  }
}

async function extractFileText(ext: string, buffer: Buffer) {
  if (ext === ".html" || ext === ".htm") return stripHtml(buffer.toString("utf8"));
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") return buffer.toString("utf8");
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ buffer });
    return res.value;
  }
  if (ext === ".pdf") {
    const mod = await import("pdf-parse");
    const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default
      ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
    const res = await pdfParse(buffer);
    return res.text;
  }
  throw new Error(`Unsupported file type: ${ext || "unknown"}`);
}

export function reportMessage(opts: {
  roomId: string;
  messageId: string;
  reporterUserId: string;
  reason: string;
}) {
  mutateStore((s) => {
    s.reports.push({
      id: id(),
      roomId: opts.roomId,
      messageId: opts.messageId,
      reporterUserId: opts.reporterUserId,
      reason: opts.reason,
      createdAt: nowIso(),
      status: "open",
    });
    s.moderationEvents.push({
      id: id(),
      createdAt: nowIso(),
      actorUserId: opts.reporterUserId,
      targetUserId: null,
      roomId: opts.roomId,
      action: "report",
      reason: opts.reason,
      details: { messageId: opts.messageId },
    });
  });
}

export function moderateUser(opts: {
  actorId: string;
  targetId: string;
  action: "mute" | "ban" | "unmute" | "unban";
  reason: string;
  roomId?: string;
}) {
  mutateStore((s) => {
    const t = s.profiles.find((p) => p.id === opts.targetId);
    if (!t) throw new Error("User not found");
    if (opts.action === "mute") t.mutedUntil = new Date(Date.now() + 6 * 3600_000).toISOString();
    if (opts.action === "unmute") t.mutedUntil = null;
    if (opts.action === "ban") {
      t.bannedAt = nowIso();
      t.banReason = opts.reason;
    }
    if (opts.action === "unban") {
      t.bannedAt = null;
      t.banReason = null;
    }
    s.moderationEvents.push({
      id: id(),
      createdAt: nowIso(),
      actorUserId: opts.actorId,
      targetUserId: opts.targetId,
      roomId: opts.roomId ?? null,
      action: opts.action,
      reason: opts.reason,
      details: {},
    });
  });
}

export function createRoom(opts: {
  name: string;
  description: string;
  roomType: Room["roomType"];
  activityMode: Room["activityMode"];
  createdBy: string;
}) {
  const room: Room = {
    id: id(),
    name: opts.name,
    description: opts.description,
    roomType: opts.roomType,
    isActive: true,
    activityMode: opts.activityMode,
    createdAt: nowIso(),
    createdBy: opts.createdBy,
  };
  mutateStore((s) => {
    s.rooms.push(room);
    s.members.push({
      roomId: room.id,
      userId: opts.createdBy,
      role: "admin",
      joinedAt: nowIso(),
      lastReadAt: nowIso(),
    });
  });
  ensureRoomPersonas(room.id);
  return room;
}

export function adminOverview() {
  const s = loadStore();
  return {
    users: s.profiles.length,
    rooms: s.rooms.length,
    messages: s.messages.length,
    personas: s.personaPool.length,
    assigned: s.assignments.filter((a) => !a.activeUntil).length,
    documents: s.documents.length,
    topics: s.topics.length,
    openReports: s.reports.filter((r) => r.status === "open").length,
    tokenUsage: s.tokenUsage.reduce((a, b) => a + b.promptTokens + b.completionTokens, 0),
    botEvents: s.botEvents.slice(-12).reverse(),
    settings: s.settings,
  };
}

export function simulationSnapshot(roomId: string) {
  const s = loadStore();
  return {
    room: s.rooms.find((r) => r.id === roomId),
    state: s.conversation.find((c) => c.roomId === roomId),
    assignments: s.assignments.filter((a) => a.roomId === roomId && !a.activeUntil).map((a) => ({
      ...a,
      persona: s.aiPersonas.find((p) => p.id === a.personaId),
    })),
    events: s.botEvents.filter((e) => e.roomId === roomId).slice(-40).reverse(),
    typing: typingForRoom(roomId),
    presence: presenceForRoom(roomId, s),
  };
}

export function exportAdminCollections() {
  const s = loadStore();
  return {
    rooms: s.rooms,
    personas: s.personaPool,
    aiPersonas: s.aiPersonas,
    assignments: s.assignments,
    documents: s.documents,
    topics: s.topics,
    chunks: s.chunks.map((c) => ({ ...c, content: truncate(c.content, 240) })),
    conversation: s.conversation,
    reports: s.reports,
    moderation: s.moderationEvents.slice(-80).reverse(),
    logs: s.botEvents.slice(-80).reverse(),
    analytics: s.analytics.slice(-80).reverse(),
    tokenUsage: s.tokenUsage.slice(-80).reverse(),
    users: s.profiles.map(publicProfile),
    settings: s.settings,
  };
}

export function participants(roomId: string) {
  const s = loadStore();
  const humans = s.members
    .filter((m) => m.roomId === roomId)
    .map((m) => s.profiles.find((p) => p.id === m.userId))
    .filter(Boolean)
    .map((p) => ({
      kind: "human" as const,
      id: p!.id,
      displayName: p!.displayName,
      username: p!.username,
      presence: minutesSince(p!.lastSeenAt) < 8 ? "online" : "offline",
      isAi: false,
    }));
  const ais = s.assignments
    .filter((a) => a.roomId === roomId && !a.activeUntil)
    .map((a) => {
      const p = s.aiPersonas.find((x) => x.id === a.personaId);
      return {
        kind: "ai" as const,
        id: a.personaId,
        displayName: p?.displayName ?? "AI",
        username: p?.sourcePersonaId ?? "ai",
        presence: a.presence,
        isAi: true,
        aiDisclosureLabel: p?.aiDisclosureLabel ?? "AI",
        personality: p?.personality,
      };
    });
  return [...humans, ...ais];
}

export { sampleN };
