alter table agent_messages add column if not exists channel text not null default 'loots';
create index if not exists agent_messages_channel_idx on agent_messages (user_id, channel, created_at);

create table if not exists bot_runs (
  id text primary key,
  user_id text not null,
  bot_id text not null,
  bot_name text not null,
  task text not null,
  result text not null,
  created_at timestamptz not null default now()
);
create index if not exists bot_runs_user_idx on bot_runs (user_id, created_at desc);

create table if not exists desk_settings (
  user_id text primary key,
  brand text not null default 'KADE'
);
