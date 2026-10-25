-- Account deletion with a vet visit recorded from a check (found 25 October 2026).
--
-- `pet_health_events.check_id` is ON DELETE SET NULL. delete_account_data
-- removed the account's checks before its pets, so a visit linked to a check
-- got its link nulled by an UPDATE — and refuse_late_writes refuses every
-- UPDATE on an account that is `deleting`. Any account that had pressed
-- «Записать визит к врачу» on a result could not be deleted: the worker failed
-- the `data` step on every retry. The same shape waits in a course made from a
-- prescription (pet_medications.visit_item_id) and a plan made from a done item
-- (pet_health_items.source_item_id).
--
-- Only the order changes: the medical record is deleted before the checks.

create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'delete_account_data requires a user id';
  end if;

  -- A missing profile is a repeat run: the first call already removed it, and
  -- there is nothing left here to protect. A profile that exists and is not
  -- `deleting` is a different account entirely — nobody asked for it to be
  -- removed, and this function must refuse to guess otherwise.
  if exists (select 1 from public.profiles where id = p_user_id and status <> 'deleting') then
    raise exception 'account % is not being deleted', p_user_id using errcode = 'check_violation';
  end if;

  delete from public.check_jobs where user_id = p_user_id;

  perform public.archive_account_financials(p_user_id);

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transaction_status_events', e.id, coalesce(e.created_at, now()), to_jsonb(e)
    from retired.transaction_status_events e
    join retired.transactions t on t.id = e.transaction_id
   where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transactions', t.id, coalesce(t.created_at, now()), to_jsonb(t)
    from retired.transactions t
   where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  -- Status events go with their transaction by cascade.
  delete from retired.transactions where user_id = p_user_id;

  -- `retired.credit_transactions.created_at` is a nullable, zone-less legacy
  -- column (billing v1, never migrated) — unlike the two inserts above, a null
  -- here is expected, not defensive. `financial_archive.occurred_at` is `not
  -- null`, so it still needs a fallback.
  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select c.user_id, 'credit_transactions', c.id, coalesce(c.created_at at time zone 'UTC', now()), to_jsonb(c)
    from retired.credit_transactions c
   where c.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  delete from retired.credit_transactions where user_id = p_user_id;

  -- The medical record goes before the checks. A visit points at the check it
  -- was recorded from, a course at the prescription it came from and a plan
  -- at the done item it followed, all ON DELETE SET NULL. Deleting the check
  -- first nulls that link with an UPDATE, which refuse_late_writes refuses on
  -- an account being deleted, and the whole deletion stops. Deletes are not
  -- guarded, so removing the referencing rows first leaves nothing to null.
  delete from public.pet_medications where user_id = p_user_id;
  delete from public.pet_health_items where user_id = p_user_id;
  delete from public.pet_health_events where user_id = p_user_id;
  delete from public.symptom_checks where user_id = p_user_id;
  delete from public.pets where user_id = p_user_id;
  -- user_feedback goes with the profile by cascade.
  delete from public.profiles where id = p_user_id;
end;
$$;

/**
 * Gives the deletions this bug stopped another round.
 *
 * After five failed attempts a job turns `action_required` and the cron leaves
 * it alone, so an account that hit this before the fix would stay undeleted
 * after it too. Only jobs whose `data` step failed and never finished are
 * reopened: the attempts start over, and the next run resumes after the steps
 * already done. A job that fails again for another reason comes back to
 * `action_required` after five more tries, as before. Returns how many were
 * reopened; run once below, and safe to run again.
 */
create or replace function public.reopen_stuck_data_deletions()
returns integer
language sql
security definer
set search_path = public
as $$
  with reopened as (
    update public.deletion_jobs
       set status = 'in_progress', attempts = 0, error_code = null, lease_until = null, updated_at = now()
     where status = 'action_required'
       and error_code = 'data_step_failed'
       and not (progress ? 'data')
    returning 1
  )
  select count(*)::integer from reopened;
$$;

revoke all on function public.reopen_stuck_data_deletions() from public, anon, authenticated;
grant execute on function public.reopen_stuck_data_deletions() to service_role;

select public.reopen_stuck_data_deletions();
