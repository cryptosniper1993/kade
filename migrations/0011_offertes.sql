-- Offertes: na goedkeuring om te zetten naar een (concept)factuur.
create table if not exists quotes (
  id text primary key,
  user_id text not null,
  number text not null,
  client_id text,
  client_name text not null,
  client_vat text not null default '',
  client_address text not null default '',
  issue_date date not null,
  valid_until date not null,
  status text not null default 'concept',
  notes text not null default '',
  lines jsonb not null,
  project_id text,
  invoice_id text,
  created_at timestamptz not null default now()
);
create index if not exists quotes_user_idx on quotes (user_id);
create unique index if not exists quotes_invoice_once on quotes (invoice_id) where invoice_id is not null;
