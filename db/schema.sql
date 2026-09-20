-- Harbor Chat PostgreSQL schema (Render / any Postgres)
-- App state is stored in app_state.payload; relational tables mirror core records.

create extension if not exists "pgcrypto";

create table if not exists app_state (
  id int primary key default 1,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key,
  username text unique not null,
  display_name text not null,
  email text unique not null,
  password_hash text not null default '',
  avatar_url text,
  bio text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  muted_until timestamptz,
  banned_at timestamptz,
  ban_reason text
);

create table if not exists rooms (
  id uuid primary key,
  name text not null,
  description text not null default '',
  room_type text not null,
  is_active boolean not null default true,
  activity_mode text not null default 'adaptive',
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists room_members (
  room_id uuid not null,
  user_id uuid not null,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists persona_pool (
  id uuid primary key,
  source_persona_id text not null,
  display_name text not null,
  region text,
  experience_level text,
  personality text,
  communication_style text,
  knowledge_level text,
  activity_level text,
  extra jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  import_batch_id text
);

create table if not exists ai_personas (
  id uuid primary key,
  source_persona_id text not null,
  pool_record_id uuid,
  display_name text not null,
  region text,
  experience_level text,
  personality text,
  communication_style text,
  knowledge_level text,
  activity_level text,
  ai_disclosure_label text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists persona_assignments (
  id uuid primary key,
  room_id uuid not null,
  persona_id uuid not null,
  assigned_at timestamptz not null default now(),
  active_until timestamptz,
  activity_state text not null default 'quiet',
  last_active_at timestamptz,
  presence text not null default 'online',
  presence_jitter double precision not null default 0
);

create table if not exists messages (
  id uuid primary key,
  room_id uuid not null,
  sender_user_id uuid,
  sender_ai_persona_id uuid,
  content text not null,
  message_type text not null default 'text',
  reply_to_message_id uuid,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint messages_one_sender check (
    (sender_user_id is not null and sender_ai_persona_id is null)
    or (sender_user_id is null and sender_ai_persona_id is not null)
  )
);

create table if not exists documents (
  id uuid primary key,
  filename text not null,
  file_type text not null,
  storage_path text not null,
  status text not null default 'pending',
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  error text,
  confirmation boolean not null default false
);

create table if not exists topics (
  id uuid primary key,
  name text not null,
  description text not null default '',
  source_document_id uuid,
  priority int not null default 5,
  tags text[] not null default '{}',
  related_topic_ids text[] not null default '{}',
  allowed_angles text[] not null default '{}',
  active boolean not null default true
);

create table if not exists knowledge_chunks (
  id uuid primary key,
  document_id uuid not null,
  title text not null,
  content text not null,
  topic_id uuid,
  kind text not null default 'general',
  embedding jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists room_conversation_state (
  room_id uuid primary key,
  current_topic_id uuid,
  topic_started_at timestamptz,
  topic_message_count int not null default 0,
  topic_energy double precision not null default 0.7,
  last_message_at timestamptz,
  last_human_message_at timestamptz,
  last_ai_message_at timestamptz,
  activity_score double precision not null default 0.4,
  activity_state text not null default 'quiet',
  conversation_summary text not null default '',
  unresolved_questions jsonb not null default '[]'::jsonb,
  topic_history jsonb not null default '[]'::jsonb,
  displayed_online_count int not null default 70,
  updated_at timestamptz not null default now()
);

create table if not exists bot_events (
  id uuid primary key,
  room_id uuid,
  created_at timestamptz not null default now(),
  decision text not null,
  speaker_persona_id uuid,
  reason text not null,
  details jsonb not null default '{}'::jsonb
);

create table if not exists moderation_events (
  id uuid primary key,
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  target_user_id uuid,
  room_id uuid,
  action text not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb
);

create table if not exists reports (
  id uuid primary key,
  room_id uuid,
  message_id uuid,
  reporter_user_id uuid,
  reason text not null,
  created_at timestamptz not null default now(),
  status text not null default 'open'
);

create table if not exists platform_settings (
  id int primary key default 1,
  payload jsonb not null
);

create table if not exists token_usage (
  id uuid primary key,
  created_at timestamptz not null default now(),
  room_id uuid,
  provider text not null,
  model text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  kind text not null default ''
);

create index if not exists messages_room_created_idx on messages (room_id, created_at);
create index if not exists persona_assignments_room_idx on persona_assignments (room_id);
