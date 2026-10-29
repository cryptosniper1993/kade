-- JustAMinute-implementatie (dossier §3, §4, §6, §7, §11): projectvelden, prospectie, batches,
-- niet-contacteren-lijst, approval queue, bot-sleutels met scope, audit log, verboden namen, thema.

alter table projects add column if not exists bot_id text not null default '';
alter table projects add column if not exists confidential boolean not null default false;
alter table projects add column if not exists phase text not null default '';
alter table projects add column if not exists contacts text not null default '';
alter table projects add column if not exists next_action text not null default '';
alter table projects add column if not exists client_id text;

create table if not exists prospects (
  id text primary key,
  user_id text not null,
  nr integer not null,
  bedrijf text not null,
  branche text not null default '',
  gemeente text not null default '',
  afstand text not null default '',
  website text not null default '',
  email text not null default '',
  telefoon text not null default '',
  bron text not null default '',
  haakje text not null default '',
  prioriteit text not null default '',
  opmerking text not null default '',
  status text not null default 'nieuw',
  status_note text not null default '',
  sent_on date,
  batch integer,
  last_contact_on date,
  project_id text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists prospects_user_nr on prospects (user_id, nr);

create table if not exists prospect_batches (
  id text primary key,
  user_id text not null,
  nr integer not null,
  created_on date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists prospect_batches_user_nr on prospect_batches (user_id, nr);

create table if not exists do_not_contact (
  user_id text not null,
  email text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, email)
);

-- Alles wat naar buiten gaat. Verzenden kan enkel met het approval_token dat Kobe bij goedkeuring krijgt.
create table if not exists approvals (
  id text primary key,
  user_id text not null,
  kind text not null,
  status text not null default 'wacht_goedkeuring',
  project_id text,
  prospect_nr integer,
  quote_id text,
  recipient text not null default '',
  subject text not null default '',
  body text not null default '',
  original_body text not null default '',
  issues jsonb not null default '[]'::jsonb,
  created_by text not null,
  decided_by text not null default '',
  decided_at timestamptz,
  approval_token_hash text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists approvals_user_idx on approvals (user_id, status);

create table if not exists bot_keys (
  id text primary key,
  user_id text not null,
  name text not null,
  grok_bot_id text not null default '',
  scope text not null,
  project_id text,
  key_hash text not null unique,
  key_hint text not null default '',
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bot_keys_user_idx on bot_keys (user_id);

create table if not exists audit_log (
  id text primary key,
  user_id text not null,
  actor text not null,
  action text not null,
  object text not null default '',
  object_id text not null default '',
  detail text not null default '',
  approved_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists audit_user_idx on audit_log (user_id, created_at desc);

create table if not exists outreach_settings (
  user_id text primary key,
  forbidden_names text not null default '',
  max_per_day integer not null default 15,
  window_from text not null default '08:30',
  window_until text not null default '11:00',
  activity_start date,
  exemption_threshold numeric not null default 25000
);

alter table desk_settings add column if not exists theme text not null default 'kade';

-- GROK BOTS: meerdere uitgaande Grok Bot-webhooks (joly jumper + projectbots), één actieve.
create table if not exists grok_bots (
  id text primary key,
  user_id text not null,
  name text not null,
  role text not null default '',
  grok_bot_id text not null default '',
  scope text not null default 'sales',
  project_id text,
  webhook_url text not null default '',
  sender_key text not null default '',
  header_mode text not null default 'bearer',
  header_name text not null default '',
  last_status integer,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists grok_bots_user_idx on grok_bots (user_id);
alter table grokbot_log add column if not exists bot_id text;
alter table desk_settings add column if not exists active_grok_bot text not null default '';
alter table bot_keys add column if not exists grok_bot_ref text;

-- Bestaande enkelvoudige koppeling overnemen als eerste bot.
insert into grok_bots (id, user_id, name, role, webhook_url, sender_key, header_mode, header_name, last_status, last_checked_at)
select 'gb-' || user_id, user_id, 'Grok Bot', 'Standaardkoppeling (overgenomen uit Instellingen)', webhook_url, sender_key, header_mode, header_name, last_status, last_checked_at
from grokbot_settings where webhook_url <> '' or sender_key <> ''
on conflict (id) do nothing;
update grokbot_log set bot_id = 'gb-' || user_id where bot_id is null;

-- GROK BOTS outbox: opdrachten die niet aankwamen (Grok Bot onbereikbaar) worden later opnieuw verstuurd.
create table if not exists grokbot_outbox (
  id text primary key,
  user_id text not null,
  bot_id text not null,
  body jsonb not null,
  opdracht text not null default '',
  status text not null default 'wachtrij',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists grokbot_outbox_due on grokbot_outbox (user_id, status, next_attempt_at);
