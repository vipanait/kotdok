-- Add locale preference to user profiles.
--
-- * New registrations: the column default 'ru' is picked up automatically
--   by the handle_new_user trigger without any trigger modification.
-- * Existing rows: Postgres sets the default on all rows when the column
--   is added, so no separate backfill needed.
-- * Check constraint limits the column to supported locale codes.

alter table public.profiles
  add column if not exists locale text not null default 'ru';

alter table public.profiles
  drop constraint if exists profiles_locale_check;

alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('ru', 'en'));
