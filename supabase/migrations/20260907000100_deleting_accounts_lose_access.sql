-- An account that is being deleted must lose access through every path, not
-- just through /api/v1.
--
-- The policies so far asked only "is this row yours". A user whose deletion has
-- started still holds a valid JWT until it expires, and could keep reading their
-- own rows straight through PostgREST. Direct writes are already gone, but a
-- read is still access.

/**
 * Whether the calling account is active. SECURITY DEFINER so the lookup is not
 * itself subject to the policy it is used in, which would recurse.
 *
 * It answers only about the caller: there is no argument to point it at someone
 * else, so granting it to anon and authenticated — which policies require —
 * exposes nothing.
 */
create or replace function public.current_account_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

revoke execute on function public.current_account_is_active() from public;
grant execute on function public.current_account_is_active() to anon, authenticated, service_role;

drop policy if exists "Users see own profile" on public.profiles;
create policy "Users see own profile" on public.profiles
  for select using (auth.uid() = id and status = 'active');

drop policy if exists "Users manage own cats" on public.pets;
create policy "Users manage own cats" on public.pets
  for select using (auth.uid() = user_id and public.current_account_is_active());

drop policy if exists "Users see own checks" on public.symptom_checks;
create policy "Users see own checks" on public.symptom_checks
  for select using (auth.uid() = user_id and public.current_account_is_active());

drop policy if exists "Users see own transactions" on public.credit_transactions;
create policy "Users see own transactions" on public.credit_transactions
  for select using (auth.uid() = user_id and public.current_account_is_active());
