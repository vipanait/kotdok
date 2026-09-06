-- Soft-delete support for cat profiles and their symptom checks.
-- Deleting a cat marks both the cat row and its symptom_checks rows as deleted;
-- all user-facing queries must filter deleted_at IS NULL.

alter table public.cats
  add column if not exists deleted_at timestamptz;

alter table public.symptom_checks
  add column if not exists deleted_at timestamptz;

create index if not exists cats_user_active_idx
  on public.cats (user_id)
  where deleted_at is null;

create index if not exists symptom_checks_user_active_idx
  on public.symptom_checks (user_id, created_at desc)
  where deleted_at is null;
