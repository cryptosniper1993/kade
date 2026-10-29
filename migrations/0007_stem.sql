alter table desk_settings add column if not exists agent_name text not null default 'Jarvis';
alter table desk_settings add column if not exists voice_uri text not null default '';
alter table desk_settings add column if not exists voice_lang text not null default 'nl-BE';
alter table desk_settings add column if not exists voice_rate real not null default 1;
alter table desk_settings add column if not exists voice_pitch real not null default 1;
alter table desk_settings add column if not exists voice_volume real not null default 1;
alter table desk_settings add column if not exists auto_speak boolean not null default true;
alter table desk_settings add column if not exists send_on_listen boolean not null default true;
