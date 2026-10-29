-- Peppol (verplichte B2B e-facturatie in België sinds 1 januari 2026).
alter table clients add column if not exists peppol_id text not null default '';
alter table invoices add column if not exists peppol_status text not null default 'concept';
alter table invoices add column if not exists peppol_message text not null default '';
alter table invoices add column if not exists peppol_ref text not null default '';
alter table invoices add column if not exists peppol_sent_at timestamptz;
