import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { defaultSettings, type StoreShape } from "../types";

let pool: Pool | null = null;

export function databaseUrl() {
  return process.env.DATABASE_URL?.trim() || "";
}

export function usesPostgres() {
  const backend = (process.env.DATA_BACKEND || "").toLowerCase();
  if (backend === "local") return false;
  if (backend === "postgres" || backend === "postgresql") return Boolean(databaseUrl());
  return Boolean(databaseUrl());
}

export function getPool() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!pool) {
    const ssl =
      process.env.DATABASE_SSL === "false"
        ? false
        : url.includes("localhost") || url.includes("127.0.0.1")
          ? false
          : { rejectUnauthorized: false };
    pool = new Pool({
      connectionString: url,
      max: 8,
      ssl,
    });
  }
  return pool;
}

export async function migratePostgres() {
  const sql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await getPool().query(sql);
}

export async function loadFromPostgres(): Promise<StoreShape | null> {
  const { rows } = await getPool().query<{ payload: StoreShape }>(
    "select payload from app_state where id = 1",
  );
  const payload = rows[0]?.payload;
  if (!payload || typeof payload !== "object") return null;
  const empty = {
    profiles: [],
    rooms: [],
    members: [],
    messages: [],
    personaPool: [],
    aiPersonas: [],
    assignments: [],
    documents: [],
    chunks: [],
    topics: [],
    conversation: [],
    botEvents: [],
    moderationEvents: [],
    reports: [],
    tokenUsage: [],
    settings: defaultSettings(),
    personaMemory: [],
    typing: [],
    analytics: [],
    seeded: false,
  } satisfies StoreShape;
  return {
    ...empty,
    ...payload,
    settings: { ...defaultSettings(), ...(payload.settings ?? {}) },
  };
}

export async function saveToPostgres(store: StoreShape) {
  await getPool().query(
    `insert into app_state (id, payload, updated_at)
     values (1, $1::jsonb, now())
     on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
    [JSON.stringify(store)],
  );
}

export async function syncPostgresMirrors(store: StoreShape) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await syncRelational(client, store);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

async function syncRelational(client: PoolClient, store: StoreShape) {
  await client.query(
    `insert into platform_settings (id, payload) values (1, $1::jsonb)
     on conflict (id) do update set payload = excluded.payload`,
    [JSON.stringify(store.settings)],
  );

  for (const p of store.profiles) {
    await client.query(
      `insert into profiles (id, username, display_name, email, password_hash, avatar_url, bio, is_admin, created_at, last_seen_at, muted_until, banned_at, ban_reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do update set
         username = excluded.username,
         display_name = excluded.display_name,
         email = excluded.email,
         password_hash = excluded.password_hash,
         avatar_url = excluded.avatar_url,
         bio = excluded.bio,
         is_admin = excluded.is_admin,
         last_seen_at = excluded.last_seen_at,
         muted_until = excluded.muted_until,
         banned_at = excluded.banned_at,
         ban_reason = excluded.ban_reason`,
      [
        p.id,
        p.username,
        p.displayName,
        p.email,
        p.passwordHash,
        p.avatarUrl,
        p.bio,
        p.isAdmin,
        p.createdAt,
        p.lastSeenAt,
        p.mutedUntil,
        p.bannedAt,
        p.banReason,
      ],
    );
  }

  for (const r of store.rooms) {
    await client.query(
      `insert into rooms (id, name, description, room_type, is_active, activity_mode, created_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set
         name = excluded.name,
         description = excluded.description,
         room_type = excluded.room_type,
         is_active = excluded.is_active,
         activity_mode = excluded.activity_mode`,
      [r.id, r.name, r.description, r.roomType, r.isActive, r.activityMode, r.createdAt, r.createdBy],
    );
  }

  for (const m of store.members) {
    await client.query(
      `insert into room_members (room_id, user_id, role, joined_at, last_read_at)
       values ($1,$2,$3,$4,$5)
       on conflict (room_id, user_id) do update set role = excluded.role, last_read_at = excluded.last_read_at`,
      [m.roomId, m.userId, m.role, m.joinedAt, m.lastReadAt],
    );
  }

  const recent = store.messages.slice(-400);
  for (const m of recent) {
    await client.query(
      `insert into messages (id, room_id, sender_user_id, sender_ai_persona_id, content, message_type, reply_to_message_id, created_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       on conflict (id) do update set content = excluded.content, metadata = excluded.metadata`,
      [
        m.id,
        m.roomId,
        m.senderUserId,
        m.senderAiPersonaId,
        m.content,
        m.messageType,
        m.replyToMessageId,
        m.createdAt,
        JSON.stringify(m.metadata ?? {}),
      ],
    );
  }

  for (const c of store.conversation) {
    await client.query(
      `insert into room_conversation_state (
         room_id, current_topic_id, topic_started_at, topic_message_count, topic_energy,
         last_message_at, last_human_message_at, last_ai_message_at, activity_score, activity_state,
         conversation_summary, unresolved_questions, topic_history, displayed_online_count, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)
       on conflict (room_id) do update set
         current_topic_id = excluded.current_topic_id,
         topic_started_at = excluded.topic_started_at,
         topic_message_count = excluded.topic_message_count,
         topic_energy = excluded.topic_energy,
         last_message_at = excluded.last_message_at,
         last_human_message_at = excluded.last_human_message_at,
         last_ai_message_at = excluded.last_ai_message_at,
         activity_score = excluded.activity_score,
         activity_state = excluded.activity_state,
         conversation_summary = excluded.conversation_summary,
         unresolved_questions = excluded.unresolved_questions,
         topic_history = excluded.topic_history,
         displayed_online_count = excluded.displayed_online_count,
         updated_at = excluded.updated_at`,
      [
        c.roomId,
        c.currentTopicId,
        c.topicStartedAt,
        c.topicMessageCount,
        c.topicEnergy,
        c.lastMessageAt,
        c.lastHumanMessageAt,
        c.lastAiMessageAt,
        c.activityScore,
        c.activityState,
        c.conversationSummary,
        JSON.stringify(c.unresolvedQuestions ?? []),
        JSON.stringify(c.topicHistory ?? []),
        Math.max(70, c.displayedOnlineCount || 70),
        c.updatedAt,
      ],
    );
  }
}

export async function postgresHealth() {
  const { rows } = await getPool().query("select 1 as ok");
  return rows[0]?.ok === 1;
}
