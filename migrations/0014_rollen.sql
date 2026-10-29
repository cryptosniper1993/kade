-- Rollen per zaak. Een zaak is de bestaande scope `user_id` van de eigenaar:
-- alle tabellen blijven op die id gescoped, er verhuist geen enkele rij.
-- Elk account hoort bij precies één zaak met één rol.
create table if not exists zaak_members (
  id text primary key,
  zaak_id text not null,
  user_id text unique,            -- null = uitnodiging die nog niet aanvaard is
  email text not null default '',
  role text not null check (role in ('eigenaar', 'boekhouder', 'medewerker', 'lezer')),
  invited_by text,
  created_at timestamptz not null default now()
);

create index if not exists zaak_members_zaak_idx on zaak_members (zaak_id);
create unique index if not exists zaak_members_zaak_email_uq on zaak_members (zaak_id, email) where email <> '';

-- Bestaande eigenaars worden Eigenaar van hun eigen zaak (zaak_id = user_id).
insert into zaak_members (id, zaak_id, user_id, email, role)
select 'own-' || u.id, u.id, u.id, lower(u.email), 'eigenaar' from "user" u
on conflict do nothing;

insert into zaak_members (id, zaak_id, user_id, email, role)
select distinct 'own-' || c.user_id, c.user_id, c.user_id, '', 'eigenaar' from companies c
on conflict do nothing;
