-- Sociaal statuut van de zelfstandige: hoofdberoep of bijberoep.
alter table companies add column if not exists activity_status text not null default 'bijberoep';
