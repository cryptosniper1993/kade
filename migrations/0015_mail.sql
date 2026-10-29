-- Mailverbinding: Outlook (Graph), Gmail, SMTP of mailprogramma (mailto/.eml).
create table if not exists mail_settings (
  user_id text primary key,
  provider text not null default 'mailto',
  from_address text not null default '',
  from_name text not null default '',
  smtp_host text not null default '',
  smtp_port integer not null default 587,
  smtp_user text not null default '',
  smtp_secure boolean not null default false,
  token_enc text not null default '',
  token_account text not null default '',
  oauth_state text not null default '',
  last_test_at timestamptz,
  last_test_ok boolean,
  updated_at timestamptz not null default now()
);
create table if not exists mail_log (
  id text primary key,
  user_id text not null,
  provider text not null,
  recipient text not null,
  subject text not null default '',
  attachment text not null default '',
  ref text not null default '',
  ok boolean not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mail_log_user_idx on mail_log (user_id, created_at desc);
alter table approvals add column if not exists invoice_id text;
