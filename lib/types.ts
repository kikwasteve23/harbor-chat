export type RoomType = "public" | "private";
export type ActivityMode = "adaptive" | "quiet" | "lively";
export type ActivityState = "dormant" | "quiet" | "low" | "moderate" | "active";
export type PresenceStatus = "online" | "idle" | "away" | "offline" | "typing";
export type MessageType = "text" | "system";
export type DocumentStatus = "pending" | "processing" | "ready" | "failed";
export type Intent =
  | "respond"
  | "wait"
  | "change_topic"
  | "allow_human"
  | "end_naturally"
  | "recover_inactivity"
  | "start_later";

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  bio: string;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt: string;
  mutedUntil: string | null;
  bannedAt: string | null;
  banReason: string | null;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  roomType: RoomType;
  isActive: boolean;
  activityMode: ActivityMode;
  createdAt: string;
  createdBy: string | null;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  role: "member" | "moderator" | "admin";
  joinedAt: string;
  lastReadAt: string;
}

export interface Message {
  id: string;
  roomId: string;
  senderUserId: string | null;
  senderAiPersonaId: string | null;
  content: string;
  messageType: MessageType;
  replyToMessageId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface PersonaPoolRecord {
  id: string;
  sourcePersonaId: string;
  displayName: string;
  region: string;
  experienceLevel: string;
  personality: string;
  communicationStyle: string;
  knowledgeLevel: string;
  activityLevel: string;
  extra: Record<string, string>;
  importedAt: string;
  importBatchId: string;
}

export interface AiPersona {
  id: string;
  sourcePersonaId: string;
  poolRecordId: string;
  displayName: string;
  region: string;
  experienceLevel: string;
  personality: string;
  communicationStyle: string;
  knowledgeLevel: string;
  activityLevel: string;
  aiDisclosureLabel: string;
  active: boolean;
  createdAt: string;
}

export interface PersonaAssignment {
  id: string;
  roomId: string;
  personaId: string;
  assignedAt: string;
  activeUntil: string | null;
  activityState: ActivityState;
  lastActiveAt: string | null;
  presence: PresenceStatus;
  presenceJitter: number;
}

export interface DocumentRecord {
  id: string;
  filename: string;
  fileType: string;
  storagePath: string;
  status: DocumentStatus;
  uploadedBy: string;
  createdAt: string;
  error: string | null;
  confirmation: boolean;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  title: string;
  content: string;
  topicId: string | null;
  kind:
    | "heading"
    | "procedure"
    | "faq"
    | "benefit"
    | "terminology"
    | "constraint"
    | "warning"
    | "general";
  embedding: number[] | null;
  metadata: Record<string, unknown>;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  sourceDocumentId: string | null;
  priority: number;
  tags: string[];
  relatedTopicIds: string[];
  allowedAngles: string[];
  active: boolean;
}

export interface RoomConversationState {
  roomId: string;
  currentTopicId: string | null;
  topicStartedAt: string | null;
  topicMessageCount: number;
  topicEnergy: number;
  lastMessageAt: string | null;
  lastHumanMessageAt: string | null;
  lastAiMessageAt: string | null;
  activityScore: number;
  activityState: ActivityState;
  conversationSummary: string;
  unresolvedQuestions: string[];
  topicHistory: string[];
  displayedOnlineCount: number;
  updatedAt: string;
}

export interface BotEvent {
  id: string;
  roomId: string;
  createdAt: string;
  decision: Intent;
  speakerPersonaId: string | null;
  reason: string;
  details: Record<string, unknown>;
}

export interface ModerationEvent {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  targetUserId: string | null;
  roomId: string | null;
  action: string;
  reason: string;
  details: Record<string, unknown>;
}

export interface Report {
  id: string;
  roomId: string;
  messageId: string;
  reporterUserId: string;
  reason: string;
  createdAt: string;
  status: "open" | "resolved" | "dismissed";
}

export interface TokenUsage {
  id: string;
  createdAt: string;
  roomId: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  kind: string;
}

export interface PlatformSettings {
  maxActiveAiPerRoom: number;
  inactivityThresholdMinutes: number;
  inactivityWarningMinutes: number;
  relatedTopicProbability: number;
  newTopicProbability: number;
  typingDelayMinMs: number;
  typingDelayMaxMs: number;
  maxBotResponseChars: number;
  aiParticipationIntensity: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  aiProvider: string;
  aiModel: string;
  temperature: number;
  maxAiResponsesPerEvent: number;
  speakerCooldownSeconds: number;
  personaReassignmentHours: number;
  blockedPhrases: string[];
  columnMap: Record<string, string>;
  personaImportConfirmed: boolean;
  minDisplayedOnline: number;
  maxDisplayedOnline: number;
}

export interface PersonaMemory {
  personaId: string;
  lastRoomId: string | null;
  lastActiveAt: string | null;
  recentTopicIds: string[];
  recentMessageIds: string[];
}

export interface TypingState {
  roomId: string;
  actorId: string;
  isAi: boolean;
  displayName: string;
  startedAt: string;
}

export interface AnalyticsSnapshot {
  id: string;
  createdAt: string;
  kind: string;
  payload: Record<string, unknown>;
}

export interface StoreShape {
  profiles: Profile[];
  rooms: Room[];
  members: RoomMember[];
  messages: Message[];
  personaPool: PersonaPoolRecord[];
  aiPersonas: AiPersona[];
  assignments: PersonaAssignment[];
  documents: DocumentRecord[];
  chunks: KnowledgeChunk[];
  topics: Topic[];
  conversation: RoomConversationState[];
  botEvents: BotEvent[];
  moderationEvents: ModerationEvent[];
  reports: Report[];
  tokenUsage: TokenUsage[];
  settings: PlatformSettings;
  personaMemory: PersonaMemory[];
  typing: TypingState[];
  analytics: AnalyticsSnapshot[];
  seeded: boolean;
}

export const defaultSettings = (): PlatformSettings => ({
  maxActiveAiPerRoom: 80,
  inactivityThresholdMinutes: 60,
  inactivityWarningMinutes: 45,
  relatedTopicProbability: 0.7,
  newTopicProbability: 0.3,
  typingDelayMinMs: 700,
  typingDelayMaxMs: 6500,
  maxBotResponseChars: 280,
  aiParticipationIntensity: 0.55,
  quietHoursStart: null,
  quietHoursEnd: null,
  aiProvider: process.env.AI_PROVIDER || "mock",
  aiModel: process.env.AI_MODEL || "gpt-4o-mini",
  temperature: 0.8,
  maxAiResponsesPerEvent: 2,
  speakerCooldownSeconds: 45,
  personaReassignmentHours: 12,
  blockedPhrases: [
    "guaranteed income",
    "wire me",
    "send bitcoin",
    "risk-free profit",
  ],
  columnMap: {
    persona_id: "persona_id",
    display_name: "display_name",
    region: "region",
    experience_level: "experience_level",
    personality: "personality",
    communication_style: "communication_style",
    knowledge_level: "knowledge_level",
    activity_level: "activity_level",
  },
  personaImportConfirmed: false,
  minDisplayedOnline: 70,
  maxDisplayedOnline: 148,
});
