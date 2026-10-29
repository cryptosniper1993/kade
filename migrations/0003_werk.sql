create table if not exists people (
  id text primary key,
  user_id text not null,
  name text not null,
  role text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists people_user_idx on people (user_id);

create table if not exists projects (
  id text primary key,
  user_id text not null,
  name text not null,
  client_name text not null default '',
  status text not null default 'actief',
  note text not null default '',
  due_on date,
  created_at timestamptz not null default now()
);
create index if not exists projects_user_idx on projects (user_id);

create table if not exists tasks (
  id text primary key,
  user_id text not null,
  project_id text,
  assignee_id text,
  title text not null,
  detail text not null default '',
  kind text not null default 'todo',
  cause text not null default '',
  priority text not null default 'normaal',
  status text not null default 'open',
  due_on date,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists tasks_user_idx on tasks (user_id, status);

create table if not exists briefings (
  id text primary key,
  user_id text not null,
  day date not null,
  body text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists briefings_user_day_idx on briefings (user_id, day);
