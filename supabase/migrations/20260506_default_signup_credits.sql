-- New users get 2 checks by default.
-- This updates the default only and does not backfill existing rows.

alter table public.profiles
  alter column credits set default 2;
