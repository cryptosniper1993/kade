-- Grok Bot-koppeling: routine-webhook en log van verstuurde opdrachten.
create table if not exists grokbot_settings (
  user_id text primary key,
  webhook_url text not null default '',
  sender_key text not null default '',
  header_mode text not null default 'bearer',
  header_name text not null default '',
  last_status integer,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists grokbot_log (
  id text primary key,
  user_id text not null,
  opdracht text not null,
  view text not null default '',
  status integer,
  ok boolean not null default false,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists grokbot_log_user on grokbot_log (user_id, created_at desc);
