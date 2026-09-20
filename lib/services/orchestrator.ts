import { clamp, hoursOfDay, minutesSince } from "../utils";
import type {
  ActivityState,
  AiPersona,
  Intent,
  Message,
  PersonaAssignment,
  PlatformSettings,
  Room,
  RoomConversationState,
  Topic,
} from "../types";

export interface OrchestratorInput {
  room: Room;
  state: RoomConversationState;
  settings: PlatformSettings;
  recent: Message[];
  topics: Topic[];
  assignments: PersonaAssignment[];
  personas: AiPersona[];
  humansOnline: number;
  humansRecentlyActive: number;
  humanIsTyping: boolean;
  lastHumanMessage?: Message;
  trigger: "human_message" | "tick" | "simulation";
  now?: number;
  rng?: () => number;
}

export interface OrchestratorDecision {
  intent: Intent;
  act: boolean;
  speakerPersonaIds: string[];
  shouldType: boolean;
  transition: "stay" | "related" | "new" | null;
  nextActivityState: ActivityState;
  reason: string;
  delayMs: number;
}

const STATES: ActivityState[] = ["dormant", "quiet", "low", "moderate", "active"];

export function nextActivityState(opts: {
  current: ActivityState;
  humansOnline: number;
  minutesSinceMessage: number;
  intensity: number;
  mode: Room["activityMode"];
  rng: () => number;
}): ActivityState {
  let idx = STATES.indexOf(opts.current);
  if (opts.humansOnline > 0) idx += 1;
  if (opts.humansOnline > 2) idx += 1;
  if (opts.minutesSinceMessage > 30) idx -= 1;
  if (opts.minutesSinceMessage > 50) idx -= 1;
  if (opts.mode === "quiet") idx -= 1;
  if (opts.mode === "lively") idx += 1;
  if (opts.rng() > opts.intensity) idx -= 1;
  if (opts.rng() < opts.intensity * 0.25) idx += 1;
  return STATES[clamp(idx, 0, STATES.length - 1)]!;
}

export function inQuietHours(settings: PlatformSettings, now = Date.now()) {
  if (settings.quietHoursStart == null || settings.quietHoursEnd == null) return false;
  const h = hoursOfDay(new Date(now));
  const a = settings.quietHoursStart;
  const b = settings.quietHoursEnd;
  if (a === b) return false;
  return a < b ? h >= a && h < b : h >= a || h < b;
}

export function inactivityRecoveryProbability(opts: {
  minutesSinceMessage: number;
  warning: number;
  threshold: number;
  humansOnline: number;
  intensity: number;
}) {
  if (opts.minutesSinceMessage < opts.warning) return 0;
  if (opts.minutesSinceMessage >= opts.threshold) return 1;
  const span = Math.max(1, opts.threshold - opts.warning);
  const t = (opts.minutesSinceMessage - opts.warning) / span;
  const humanBoost = opts.humansOnline > 0 ? 0.15 : 0;
  return clamp(t * t * 0.85 * opts.intensity + humanBoost, 0, 0.95);
}

export function typingDurationMs(
  contentLength: number,
  settings: PlatformSettings,
  rng: () => number = Math.random,
) {
  const cps = 12 + rng() * 10;
  const base = (contentLength / cps) * 1000;
  const jitter = 250 + rng() * 900;
  return clamp(
    Math.round(base + jitter),
    settings.typingDelayMinMs,
    settings.typingDelayMaxMs,
  );
}

export function isFactualQuestion(text: string) {
  return /[?]/.test(text) || /\b(how|what|when|where|who|why|can i|does|eligib|policy|pay|earn|deadline|feature|procedure)\b/i.test(
    text,
  );
}

function lastSpeakers(recent: Message[], n = 6) {
  return recent
    .slice(-n)
    .map((m) => m.senderAiPersonaId || m.senderUserId)
    .filter(Boolean) as string[];
}

export function selectSpeakers(opts: {
  personas: AiPersona[];
  assignments: PersonaAssignment[];
  recent: Message[];
  max: number;
  factual: boolean;
  humanPriority: boolean;
  rng: () => number;
}): string[] {
  const active = opts.assignments.filter((a) => !a.activeUntil);
  const byId = new Map(opts.personas.map((p) => [p.id, p]));
  const last = lastSpeakers(opts.recent);
  const lastAi = last.filter((id) => byId.has(id));
  const scored = active
    .map((a) => {
      const p = byId.get(a.personaId);
      if (!p || !p.active) return null;
      let score = 1;
      const act = p.activityLevel.toLowerCase();
      if (act.includes("high")) score += 0.6;
      if (act.includes("low")) score -= 0.4;
      if (lastAi[lastAi.length - 1] === p.id) score -= 1.2;
      if (lastAi.includes(p.id)) score -= 0.3;
      if (opts.factual) {
        if (/expert|experienced|practical|analytical/i.test(`${p.experienceLevel} ${p.personality}`))
          score += 1.1;
        if (/beginner|curious/i.test(`${p.experienceLevel} ${p.personality}`)) score -= 0.2;
      } else if (/curious|enthusiastic|beginner/i.test(`${p.personality} ${p.experienceLevel}`)) {
        score += 0.4;
      }
      score += opts.rng() * 0.35;
      return { id: p.id, score };
    })
    .filter((x): x is { id: string; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score);

  const take = opts.humanPriority
    ? opts.factual
      ? Math.min(opts.max, scored[0] && scored[0].score > 0.2 ? (opts.rng() < 0.35 ? 2 : 1) : 1)
      : opts.rng() < 0.22
        ? 0
        : Math.min(opts.max, opts.rng() < 0.25 ? 2 : 1)
    : Math.min(opts.max, opts.rng() < 0.5 ? 1 : 0);

  return scored.slice(0, take).map((s) => s.id);
}

function recentAiChain(recent: Message[]) {
  let n = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i]!.senderAiPersonaId) n += 1;
    else break;
  }
  return n;
}

function agreementLoop(recent: Message[]) {
  const last = recent.slice(-4).map((m) => m.content.toLowerCase());
  const agree = last.filter((c) => /\b(i agree|same here|this\^|exactly)\b/.test(c)).length;
  return agree >= 2;
}

export function orchestrate(input: OrchestratorInput): OrchestratorDecision {
  const rng = input.rng ?? Math.random;
  const now = input.now ?? Date.now();
  const minutes = minutesSince(input.state.lastMessageAt, now);
  const quiet = inQuietHours(input.settings, now);
  const intensity =
    input.settings.aiParticipationIntensity *
    (input.room.activityMode === "quiet" ? 0.55 : input.room.activityMode === "lively" ? 1.15 : 1) *
    (quiet ? 0.45 : 1);

  const nextState = nextActivityState({
    current: input.state.activityState,
    humansOnline: input.humansOnline,
    minutesSinceMessage: minutes,
    intensity,
    mode: input.room.activityMode,
    rng,
  });

  const recoveryP = inactivityRecoveryProbability({
    minutesSinceMessage: minutes,
    warning: input.settings.inactivityWarningMinutes,
    threshold: input.settings.inactivityThresholdMinutes,
    humansOnline: input.humansOnline,
    intensity,
  });

  if (input.humanIsTyping && input.trigger !== "human_message") {
    return {
      intent: "allow_human",
      act: false,
      speakerPersonaIds: [],
      shouldType: false,
      transition: null,
      nextActivityState: nextState,
      reason: "Human is typing — yield the floor.",
      delayMs: 0,
    };
  }

  if (input.trigger === "human_message" && input.lastHumanMessage) {
    const factual = isFactualQuestion(input.lastHumanMessage.content);
    if (recentAiChain(input.recent) >= 3 && !factual) {
      return {
        intent: "allow_human",
        act: false,
        speakerPersonaIds: [],
        shouldType: false,
        transition: null,
        nextActivityState: "active",
        reason: "Human message received after AI chain — stop bot pile-on.",
        delayMs: 0,
      };
    }
    const speakers = selectSpeakers({
      personas: input.personas,
      assignments: input.assignments,
      recent: input.recent,
      max: input.settings.maxAiResponsesPerEvent,
      factual,
      humanPriority: true,
      rng,
    });
    if (speakers.length === 0) {
      return {
        intent: "wait",
        act: false,
        speakerPersonaIds: [],
        shouldType: false,
        transition: null,
        nextActivityState: "active",
        reason: "Human has priority; no AI reply this turn (probabilistic silence).",
        delayMs: 0,
      };
    }
    return {
      intent: "respond",
      act: true,
      speakerPersonaIds: speakers,
      shouldType: true,
      transition: input.state.topicEnergy < 0.3 ? "related" : "stay",
      nextActivityState: "active",
      reason: factual
        ? "Factual human question — grounded reply from a fitting persona."
        : "Selective human-priority reply.",
      delayMs: 400 + Math.floor(rng() * 1800),
    };
  }

  if (!input.room.isActive) {
    return {
      intent: "wait",
      act: false,
      speakerPersonaIds: [],
      shouldType: false,
      transition: null,
      nextActivityState: "dormant",
      reason: "Room paused by admin.",
      delayMs: 0,
    };
  }

  if (recoveryP >= 1 || rng() < recoveryP) {
    const speakers = selectSpeakers({
      personas: input.personas,
      assignments: input.assignments,
      recent: input.recent,
      max: 1,
      factual: false,
      humanPriority: false,
      rng,
    });
    const one = speakers.slice(0, 1);
    return {
      intent: "recover_inactivity",
      act: one.length > 0,
      speakerPersonaIds: one,
      shouldType: one.length > 0,
      transition: minutes > input.settings.inactivityThresholdMinutes ? "related" : "stay",
      nextActivityState: "low",
      reason: `Inactivity recovery (p=${recoveryP.toFixed(2)}, ${minutes.toFixed(1)}m silent). Single opener only.`,
      delayMs: 800 + Math.floor(rng() * 4000),
    };
  }

  if (agreementLoop(input.recent) || recentAiChain(input.recent) >= 3) {
    return {
      intent: "end_naturally",
      act: false,
      speakerPersonaIds: [],
      shouldType: false,
      transition: input.state.topicEnergy < 0.4 ? "related" : null,
      nextActivityState: nextState === "active" ? "quiet" : nextState,
      reason: "Natural stop to avoid agreement loops / bot-to-bot chains.",
      delayMs: 0,
    };
  }

  const talkChance =
    ({ dormant: 0.01, quiet: 0.04, low: 0.1, moderate: 0.22, active: 0.18 }[nextState] ?? 0.08) *
    intensity *
    (input.humansOnline > 0 ? 1.25 : 0.55);

  if (input.humansRecentlyActive === 0 && nextState === "dormant") {
    return {
      intent: "start_later",
      act: false,
      speakerPersonaIds: [],
      shouldType: false,
      transition: null,
      nextActivityState: nextState,
      reason: "Capable of doing nothing — room dormant.",
      delayMs: 0,
    };
  }

  if (rng() > talkChance) {
    return {
      intent: "wait",
      act: false,
      speakerPersonaIds: [],
      shouldType: false,
      transition: null,
      nextActivityState: nextState,
      reason: "Probabilistic wait — no scheduled post.",
      delayMs: 0,
    };
  }

  const speakers = selectSpeakers({
    personas: input.personas,
    assignments: input.assignments,
    recent: input.recent,
    max: 1,
    factual: false,
    humanPriority: false,
    rng,
  });

  const wantTransition = input.state.topicEnergy < 0.42 || input.state.topicMessageCount >= 6;
  return {
    intent: wantTransition ? "change_topic" : "respond",
    act: speakers.length > 0,
    speakerPersonaIds: speakers.slice(0, 1),
    shouldType: speakers.length > 0,
    transition: wantTransition ? (rng() < input.settings.relatedTopicProbability ? "related" : "new") : "stay",
    nextActivityState: nextState,
    reason: wantTransition ? "Topic energy declined — consider a documented transition." : "Low-volume autonomous beat.",
    delayMs: 1200 + Math.floor(rng() * 8000),
  };
}

export function applyTopicEnergy(opts: {
  energy: number;
  humanSpoke: boolean;
  aiSpoke: boolean;
  repeatedTopic: boolean;
}) {
  let e = opts.energy;
  if (opts.humanSpoke) e += 0.18;
  if (opts.aiSpoke) e -= 0.08;
  if (opts.repeatedTopic) e -= 0.12;
  return clamp(e, 0, 1);
}
