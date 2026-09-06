-- Two changes that belong together, because the second is what makes the first
-- mean anything.
--
-- 1. Account lifecycle: profiles.status is 'active' or 'deleting'. The cleanup
--    process is stage 8, but stages 2 and 6 already refuse to serve an account
--    that is not active, so the column exists from stage 1.
--
-- 2. Direct table writes with a user token are revoked.
--
--    Hosted Supabase grants every table in `public` to anon and authenticated,
--    and the policies on profiles, pets, symptom_checks and credit_transactions
--    were written `for all using (auth.uid() = ...)` with no `with check`. A
--    signed-in user holding only the public anon key could therefore write their
--    own rows through PostgREST: setting profiles.credits to any number, or
--    profiles.role to 'admin'. Reproduced on a local stack configured with the
--    same grants.
--
--    Nothing in the application writes these tables with a user token — every
--    write goes through a server route using the service role — so revoking the
--    write privileges costs no functionality. Reads stay, because the site does
--    read symptom_checks, pets and profiles through the user's session.

-- ---------------------------------------------------------------------------
-- 1. Account lifecycle
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists status text not null default 'active';

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check check (status in ('active', 'deleting'));

-- Guards run on every request, so keep the lookup off the heap.
create index if not exists profiles_status_idx on public.profiles (status);

-- ---------------------------------------------------------------------------
-- 2. No direct writes with a user token
-- ---------------------------------------------------------------------------

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- New tables must not silently reintroduce the same hole.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated;

-- Narrow the policies to what they are actually for. Without the write
-- privileges above this is belt and braces, but a future `grant` should not be
-- enough on its own to reopen the hole.
drop policy if exists "Users see own profile" on public.profiles;
create policy "Users see own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users manage own cats" on public.pets;
create policy "Users manage own cats" on public.pets
  for select using (auth.uid() = user_id);

drop policy if exists "Users see own checks" on public.symptom_checks;
create policy "Users see own checks" on public.symptom_checks
  for select using (auth.uid() = user_id);

drop policy if exists "Users see own transactions" on public.credit_transactions;
create policy "Users see own transactions" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- user_feedback had an INSERT policy, but the feedback route writes with the
-- service role, so the client never needed the privilege.
drop policy if exists "Users can insert own feedback" on public.user_feedback;
