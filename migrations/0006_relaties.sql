alter table clients add column if not exists phone text not null default '';
alter table clients add column if not exists contact text not null default '';
alter table clients add column if not exists postal_code text not null default '';
alter table clients add column if not exists country text not null default 'België';
alter table clients add column if not exists pay_days int not null default 30;
alter table clients add column if not exists iban text not null default '';
alter table clients add column if not exists note text not null default '';
alter table clients add column if not exists active boolean not null default true;

create table if not exists suppliers (
  id text primary key,
  user_id text not null,
  name text not null,
  vat_number text not null default '',
  email text not null default '',
  phone text not null default '',
  contact text not null default '',
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  country text not null default 'België',
  pay_days int not null default 30,
  iban text not null default '',
  account text not null default '6400',
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists suppliers_user_idx on suppliers (user_id);

alter table documents add column if not exists client_id text;
alter table documents add column if not exists supplier_id text;
alter table journals add column if not exists supplier_id text;
