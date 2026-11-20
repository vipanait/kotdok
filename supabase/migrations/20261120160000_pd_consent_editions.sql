-- Second edition of the personal data consent (2026-11-20): pet photos, pet
-- documents and their recognition, questions after a check, «Можно ли?».
--
-- The owner's decision (documents spec, 13 November 2026, confirmed
-- 20 November): every account is asked for the new edition, including those
-- created before 26 September 2026 that were never asked at all. That is the
-- server's job, per client:
--
-- * A client that sends `consent-editions` in X-Lapka-Features (the site and
--   app builds from 1.3.0) owes consent until it has accepted the current
--   edition.
-- * An older app build keeps the rules of 20260926120000: only accounts with
--   `pd_consent_required` owe a consent, to any edition, and it sends
--   2026-09-26. Refusing that edition would lock it on a consent screen it
--   cannot get past.
--
-- `profiles.pd_consent_version` is the latest edition the account accepted, so
-- the per-request account check stays one query. It is kept by a trigger on
-- `personal_data_consents`; users cannot write to `profiles` (20260906000000).
-- Editions are ISO dates, so the latest is the greatest string.

alter table public.profiles add column pd_consent_version text;

update public.profiles p
set pd_consent_version = c.latest
from (
  select user_id, max(version) as latest
  from public.personal_data_consents
  group by user_id
) c
where c.user_id = p.id;

create or replace function public.sync_pd_consent_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set pd_consent_version = greatest(pd_consent_version, new.version)
  where id = new.user_id;
  return new;
end;
$$;

revoke execute on function public.sync_pd_consent_version() from public, anon, authenticated;

create trigger sync_pd_consent_version
  after insert on public.personal_data_consents
  for each row execute function public.sync_pd_consent_version();

-- Both editions are accepted: the current one from new clients, the old one
-- from builds that only know it (it also covers their sign-up metadata, read
-- by handle_new_user through this function).
create or replace function public.pd_consent_version_is_current(v text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(v in ('2026-09-26', '2026-11-20'), false);
$$;
