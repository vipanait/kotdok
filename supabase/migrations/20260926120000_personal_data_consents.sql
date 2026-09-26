-- Consent to personal-data processing, recorded as its own act.
--
-- 152-FZ art. 9 as amended from 1 September 2025: consent is a separate
-- document, not a clause of the terms of use, and the operator has to be able
-- to prove it was given. Until now the site ticked "I accept the terms" and
-- stored nothing; the app only said "by continuing you accept".
--
-- One row per user and edition of the consent text. Rows are never edited;
-- they go away only with the user (ON DELETE CASCADE from auth.users).
--
-- `profiles.pd_consent_required` says whether the account has to consent at
-- all. Every account that exists when this runs keeps false: the owner decided
-- on 26 September 2026 that only accounts created from now on are asked. New
-- rows default to true.

create table public.personal_data_consents (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  version     text not null,
  source      text not null check (source in ('web', 'ios', 'android')),
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);

alter table public.personal_data_consents enable row level security;
-- No policies and no grants: only the service role and SECURITY DEFINER code
-- read or write it, like every table since 20260906000000.
revoke all on public.personal_data_consents from anon, authenticated;

alter table public.profiles add column pd_consent_required boolean not null default false;
alter table public.profiles alter column pd_consent_required set default true;

-- The editions a client may consent to. A new edition of the text replaces
-- this function in its own migration, together with PD_CONSENT_VERSION in
-- packages/contracts.
create or replace function public.pd_consent_version_is_current(v text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(v in ('2026-09-26'), false);
$$;

-- handle_new_user: the locale rule of 20260908120000 unchanged, plus the
-- consent the client sent with an email sign-up. The metadata is
-- attacker-controlled: anything that is not an object with a current edition
-- and a known source is ignored, and nothing here may fail the sign-up.
-- Provider sign-ups carry no such metadata; they are recorded by the server
-- after the sign-in, or on the consent screen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
  consent jsonb;
  consent_version text;
  consent_source text;
begin
  requested := lower(split_part(coalesce(new.raw_user_meta_data ->> 'locale', ''), '-', 1));
  requested := split_part(requested, '_', 1);

  insert into public.profiles (id, locale)
  values (new.id, case when requested = 'ru' then 'ru' else 'en' end);

  consent := new.raw_user_meta_data -> 'pd_consent';
  if jsonb_typeof(consent) = 'object' then
    if jsonb_typeof(consent -> 'version') = 'string' then
      consent_version := consent ->> 'version';
    end if;
    if jsonb_typeof(consent -> 'source') = 'string' then
      consent_source := consent ->> 'source';
    end if;

    if public.pd_consent_version_is_current(consent_version)
       and consent_source in ('web', 'ios', 'android') then
      insert into public.personal_data_consents (user_id, version, source)
      values (new.id, consent_version, consent_source)
      on conflict (user_id, version) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
