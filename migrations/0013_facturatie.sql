-- Facturatie volgens KB nr. 1: nummer pas bij uitreiken, reeks per jaar, creditnota's,
-- btw-behandeling (verlegging / intracommunautair), eigen OGM-reeks.
alter table invoices add column if not exists kind text not null default 'invoice';
alter table invoices add column if not exists credit_of text;
alter table invoices add column if not exists vat_treatment text not null default 'standard';
alter table invoices add column if not exists b2c boolean not null default false;
alter table invoices add column if not exists ogm text not null default '';
alter table invoices add column if not exists issued_at timestamptz;
alter table invoices add column if not exists peppol_skipped text not null default '';

-- Concepten dragen geen definitief nummer meer.
update invoices set number = '' where status = 'draft';

-- Bestaande dubbels (oude count(*)+1-nummering) uniek maken vóór de index.
with d as (
  select id, row_number() over (partition by user_id, number order by created_at, id) as rn
  from invoices where number <> ''
)
update invoices i set number = i.number || '-' || d.rn from d where i.id = d.id and d.rn > 1;

create unique index if not exists invoices_user_number_uq on invoices (user_id, number) where number <> '';

-- Opeenvolgende reeksen per gebruiker (bv. 'K-2026', 'C-2026', 'ogm').
create table if not exists number_series (
  user_id text not null,
  series text not null,
  last integer not null default 0,
  primary key (user_id, series)
);

alter table companies add column if not exists exempt_threshold numeric(14,2);
alter table companies alter column legal_form set default '';
