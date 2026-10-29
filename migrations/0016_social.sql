-- Socials: Facebook-pagina, Instagram (professioneel) en TikTok. Tokens versleuteld (SOCIAL_TOKEN_KEY of MAIL_TOKEN_KEY).
create table if not exists social_accounts (
  user_id text not null,
  platform text not null,
  account_id text not null default '',
  account_name text not null default '',
  token_enc text not null default '',
  expires_at timestamptz,
  oauth_state text not null default '',
  connected_at timestamptz,
  primary key (user_id, platform)
);
create index if not exists social_accounts_state on social_accounts (oauth_state);
create table if not exists social_posts (
  id text primary key,
  user_id text not null,
  platforms text[] not null default '{}',
  body text not null default '',
  media_url text not null default '',
  media_type text not null default 'geen',
  scheduled_at timestamptz,
  status text not null default 'concept',
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists social_posts_user on social_posts (user_id, status, scheduled_at);
