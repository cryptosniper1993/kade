create table if not exists assets (
  id text primary key,
  user_id text not null,
  name text not null,
  kind text not null default 'eigendom',
  category text not null default 'hardware',
  ref text not null default '',
  vendor text not null default '',
  acquired_on date,
  ends_on date,
  amount_eur numeric not null default 0,
  residual_eur numeric not null default 0,
  life_months int not null default 36,
  status text not null default 'gebruik',
  holder_id text,
  project_id text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists assets_user_idx on assets (user_id);

create table if not exists incidents (
  id text primary key,
  user_id text not null,
  asset_id text,
  project_id text,
  task_id text,
  title text not null,
  detail text not null default '',
  severity text not null default 'hoog',
  status text not null default 'open',
  happened_on date,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists incidents_user_idx on incidents (user_id, status);
