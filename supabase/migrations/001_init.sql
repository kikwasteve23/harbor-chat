-- Harbor Chat schema for Supabase / PostgreSQL
-- Apply with the Supabase SQL editor or CLI. Local development uses the file store instead.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text not null,
  email text unique not null,
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
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  room_type text not null check (room_type in ('public', 'private')),
  is_active boolean not null default true,
  activity_mode text not null default 'adaptive',
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table if not exists room_members (
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists persona_pool (
  id uuid primary key default gen_random_uuid(),
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
  import_batch_id uuid
);

create table if not exists ai_personas (
  id uuid primary key default gen_random_uuid(),
  source_persona_id text not null,
  pool_record_id uuid references persona_pool(id),
  display_name text not null,
  region text,
  experience_level text,
  personality text,
  communication_style text,
  knowledge_level text,
  activity_level text,
  ai_disclosure_label text not null default 'AI',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists persona_assignments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  persona_id uuid not null references ai_personas(id),
  assigned_at timestamptz not null default now(),
  active_until timestamptz,
  activity_state text not null default 'quiet',
  last_active_at timestamptz
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  sender_user_id uuid references profiles(id),
  sender_ai_persona_id uuid references ai_personas(id),
  content text not null,
  message_type text not null default 'text',
  reply_to_message_id uuid references messages(id),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint messages_one_sender check (
    (sender_user_id is not null and sender_ai_persona_id is null)
    or (sender_user_id is null and sender_ai_persona_id is not null)
  )
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_type text not null,
  storage_path text not null,
  status text not null default 'pending',
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  source_document_id uuid references documents(id) on delete set null,
  priority int not null default 5,
  tags text[] not null default '{}',
  related_topic_ids uuid[] not null default '{}',
  allowed_angles text[] not null default '{}',
  active boolean not null default true
);

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  title text not null,
  content text not null,
  topic_id uuid references topics(id),
  kind text not null default 'general',
  embedding jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists room_conversation_state (
  room_id uuid primary key references rooms(id) on delete cascade,
  current_topic_id uuid references topics(id),
  topic_started_at timestamptz,
  topic_message_count int not null default 0,
  topic_energy double precision not null default 0.7,
  last_message_at timestamptz,
  last_human_message_at timestamptz,
  activity_score double precision not null default 0.4,
  updated_at timestamptz not null default now()
);

create table if not exists bot_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  decision text not null,
  speaker_persona_id uuid,
  reason text not null,
  details jsonb not null default '{}'::jsonb
);

create table if not exists moderation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  target_user_id uuid,
  room_id uuid,
  action text not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  reporter_user_id uuid references profiles(id),
  reason text not null,
  created_at timestamptz not null default now(),
  status text not null default 'open'
);

create table if not exists platform_settings (
  id int primary key default 1,
  payload jsonb not null
);

alter table profiles enable row level security;
alter table rooms enable row level security;
alter table messages enable row level security;
alter table reports enable row level security;

create policy "public rooms readable" on rooms for select using (room_type = 'public' or true);
create policy "members read messages" on messages for select using (true);
