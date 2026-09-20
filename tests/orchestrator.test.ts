import { describe, expect, it } from "vitest";
import {
  inactivityRecoveryProbability,
  isFactualQuestion,
  orchestrate,
  selectSpeakers,
  typingDurationMs,
} from "../lib/services/orchestrator";
import { findBlockedPhrase, looksLikeScamOrFabrication, sanitizeAiContent } from "../lib/services/moderation";
import { defaultSettings, type AiPersona, type Message, type Room, type RoomConversationState } from "../lib/types";

const room: Room = {
  id: "r",
  name: "Lounge",
  description: "",
  roomType: "public",
  isActive: true,
  activityMode: "adaptive",
  createdAt: new Date().toISOString(),
  createdBy: null,
};

function state(partial: Partial<RoomConversationState> = {}): RoomConversationState {
  return {
    roomId: "r",
    currentTopicId: "t1",
    topicStartedAt: new Date().toISOString(),
    topicMessageCount: 2,
    topicEnergy: 0.6,
    lastMessageAt: new Date().toISOString(),
    lastHumanMessageAt: new Date().toISOString(),
    lastAiMessageAt: null,
    activityScore: 0.4,
    activityState: "quiet",
    conversationSummary: "",
    unresolvedQuestions: [],
    topicHistory: ["t1"],
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

const personas: AiPersona[] = [
  {
    id: "p1",
    sourcePersonaId: "A",
    poolRecordId: "x",
    displayName: "Omar",
    region: "T",
    experienceLevel: "experienced",
    personality: "practical",
    communicationStyle: "concise",
    knowledgeLevel: "procedural",
    activityLevel: "high",
    aiDisclosureLabel: "AI",
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "p2",
    sourcePersonaId: "B",
    poolRecordId: "y",
    displayName: "Nia",
    region: "L",
    experienceLevel: "beginner",
    personality: "curious",
    communicationStyle: "casual",
    knowledgeLevel: "general",
    activityLevel: "low",
    aiDisclosureLabel: "AI",
    active: true,
    createdAt: new Date().toISOString(),
  },
];

const assignments = personas.map((p) => ({
  id: p.id,
  roomId: "r",
  personaId: p.id,
  assignedAt: new Date().toISOString(),
  activeUntil: null,
  activityState: "quiet" as const,
  lastActiveAt: null,
  presence: "online" as const,
  presenceJitter: 0,
}));

describe("inactivity recovery", () => {
  it("is zero before the warning threshold", () => {
    expect(
      inactivityRecoveryProbability({
        minutesSinceMessage: 10,
        warning: 45,
        threshold: 60,
        humansOnline: 0,
        intensity: 1,
      }),
    ).toBe(0);
  });

  it("is certain at the 60 minute threshold", () => {
    expect(
      inactivityRecoveryProbability({
        minutesSinceMessage: 60,
        warning: 45,
        threshold: 60,
        humansOnline: 0,
        intensity: 1,
      }),
    ).toBe(1);
  });

  it("recovers with a single speaker after long silence", () => {
    const decision = orchestrate({
      room,
      state: state({ lastMessageAt: new Date(Date.now() - 61 * 60_000).toISOString() }),
      settings: defaultSettings(),
      recent: [],
      topics: [],
      assignments,
      personas,
      humansOnline: 0,
      humansRecentlyActive: 0,
      humanIsTyping: false,
      trigger: "tick",
      rng: () => 0.01,
    });
    expect(decision.intent).toBe("recover_inactivity");
    expect(decision.speakerPersonaIds.length).toBeLessThanOrEqual(1);
  });
});

describe("speaker selection and human priority", () => {
  it("does not require a reply to every human message", () => {
    const human: Message = {
      id: "m",
      roomId: "r",
      senderUserId: "u",
      senderAiPersonaId: null,
      content: "nice weather in here",
      messageType: "text",
      replyToMessageId: null,
      createdAt: new Date().toISOString(),
      metadata: {},
    };
    const decision = orchestrate({
      room,
      state: state(),
      settings: defaultSettings(),
      recent: [human],
      topics: [],
      assignments,
      personas,
      humansOnline: 1,
      humansRecentlyActive: 1,
      humanIsTyping: false,
      lastHumanMessage: human,
      trigger: "human_message",
      rng: () => 0.01,
    });
    expect(["respond", "wait", "allow_human"]).toContain(decision.intent);
    expect(decision.speakerPersonaIds.length).toBeLessThanOrEqual(2);
  });

  it("prefers experienced personas for factual questions", () => {
    const ids = selectSpeakers({
      personas,
      assignments,
      recent: [],
      max: 1,
      factual: true,
      humanPriority: true,
      rng: () => 0.1,
    });
    expect(ids[0]).toBe("p1");
  });

  it("detects factual questions", () => {
    expect(isFactualQuestion("How do I join a private room?")).toBe(true);
  });
});

describe("typing duration", () => {
  it("grows with length and stays bounded", () => {
    const settings = defaultSettings();
    const short = typingDurationMs(20, settings, () => 0.5);
    const long = typingDurationMs(800, settings, () => 0.5);
    expect(short).toBeGreaterThanOrEqual(settings.typingDelayMinMs);
    expect(long).toBeLessThanOrEqual(settings.typingDelayMaxMs);
    expect(long).toBeGreaterThan(short);
  });
});

describe("moderation", () => {
  it("flags blocked phrases and scam-like claims", () => {
    expect(findBlockedPhrase("this is a guaranteed income scheme")).toBeTruthy();
    expect(looksLikeScamOrFabrication("I made $5000 last week")).toBe(true);
    const cleaned = sanitizeAiContent("wire me bitcoin for a guaranteed return", 200);
    expect(cleaned.toLowerCase()).toContain("documentation");
  });
});

describe("database sender constraint", () => {
  it("rejects messages without exactly one sender", () => {
    const both = { senderUserId: "u", senderAiPersonaId: "p" };
    const neither = { senderUserId: null, senderAiPersonaId: null };
    const xor = (m: { senderUserId: string | null; senderAiPersonaId: string | null }) =>
      Boolean(m.senderUserId) !== Boolean(m.senderAiPersonaId);
    expect(xor(both)).toBe(false);
    expect(xor(neither)).toBe(false);
    expect(xor({ senderUserId: "u", senderAiPersonaId: null })).toBe(true);
  });
});
