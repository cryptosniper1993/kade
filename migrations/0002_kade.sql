create table if not exists companies (
  user_id text primary key,
  name text not null,
  legal_form text not null default 'bv',
  vat_number text not null default '',
  enterprise_number text not null default '',
  address text not null default '',
  city text not null default '',
  email text not null default '',
  iban text not null default '',
  vat_regime text not null default 'quarterly',
  year_end_month int not null default 12
);

create table if not exists clients (
  id text primary key,
  user_id text not null,
  name text not null,
  vat_number text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default '',
  demo boolean not null default false
);
create index if not exists clients_user_idx on clients (user_id);

create table if not exists invoices (
  id text primary key,
  user_id text not null,
  number text not null,
  client_id text,
  client_name text not null,
  client_vat text not null default '',
  client_address text not null default '',
  issue_date date not null,
  due_date date not null,
  status text not null default 'draft',
  notes text not null default '',
  lines jsonb not null,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists invoices_user_idx on invoices (user_id);

create table if not exists journals (
  id text primary key,
  user_id text not null,
  booked_on date not null,
  memo text not null,
  source text not null default 'manual',
  ref text not null default '',
  demo boolean not null default false
);
create index if not exists journals_user_idx on journals (user_id, booked_on);

create table if not exists journal_lines (
  id text primary key,
  journal_id text not null,
  user_id text not null,
  account text not null,
  label text not null,
  debit numeric not null default 0,
  credit numeric not null default 0
);
create index if not exists journal_lines_journal_idx on journal_lines (journal_id);

create table if not exists documents (
  id text primary key,
  user_id text not null,
  filename text not null,
  mime text not null,
  kind text not null,
  vendor text not null default '',
  doc_date date,
  amount_eur numeric,
  note text not null default '',
  data_url text not null,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists documents_user_idx on documents (user_id);

create table if not exists bots (
  id text primary key,
  user_id text not null,
  name text not null,
  role text not null,
  brief text not null,
  followed boolean not null default true,
  status text not null default 'idle',
  task text not null default '',
  last_result text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists bots_user_idx on bots (user_id);

create table if not exists researches (
  id text primary key,
  user_id text not null,
  title text not null,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
create index if not exists researches_user_idx on researches (user_id, created_at desc);

create table if not exists agent_messages (
  id text primary key,
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_messages_user_idx on agent_messages (user_id, created_at);
