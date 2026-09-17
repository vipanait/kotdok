-- Carrying out an accepted deletion request (stage 8/05).
--
-- Since 9 September a request marks the account `deleting` and records a job,
-- and then nothing happens: no code removes the data. These are the pieces the
-- worker in apps/web/src/server/account/deletion-worker.ts calls. The worker
-- owns the order of the steps; the database owns what each step does and who
-- may hold the job while it runs.
--
-- Revoking Apple tokens is not here: the owner deferred it on 17 September 2026.

alter table public.deletion_jobs
  add column if not exists attempts integer not null default 0;

alter table public.deletion_jobs
  add column if not exists lease_until timestamptz;

comment on column public.deletion_jobs.lease_until is
  'Until when a worker holds this job. Null or past means anyone may claim it.';

/**
 * Takes the job for one worker, or answers that somebody else has it.
 *
 * One statement, so the request's own `after()` and the daily cron arriving
 * together cannot both get the job: the second `update` finds the lease taken
 * and changes nothing. A job waiting on a person (`action_required`) and a
 * finished one are never claimed.
 *
 * Returns the job's progress, so the worker knows which steps already ran.
 */
create or replace function public.claim_deletion_job(p_user_id uuid, p_lease_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress jsonb;
begin
  update public.deletion_jobs
     set status = 'in_progress',
         lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where user_id = p_user_id
     and status in ('pending', 'in_progress')
     and (lease_until is null or lease_until <= now())
  returning progress into v_progress;

  return v_progress;
end;
$$;

/** Records that a step finished, so a retry does not run it again. */
create or replace function public.mark_deletion_step(p_user_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_step not in ('data', 'auth') then
    raise exception 'unknown deletion step %', p_step using errcode = 'invalid_parameter_value';
  end if;

  update public.deletion_jobs
     set progress = progress || jsonb_build_object(p_step, now()),
         updated_at = now()
   where user_id = p_user_id;
end;
$$;

/**
 * Counts a failed attempt and lets go of the job.
 *
 * Below the limit the job stays `in_progress` with no lease, so the next run —
 * the cron at the latest — picks it up. At the limit it becomes
 * `action_required`: a person has to look, and the status says so instead of
 * pretending the deletion finished.
 */
create or replace function public.record_deletion_failure(
  p_user_id uuid,
  p_error_code text,
  p_max_attempts integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  update public.deletion_jobs
     set attempts = attempts + 1,
         error_code = p_error_code,
         lease_until = null,
         status = case when attempts + 1 >= p_max_attempts then 'action_required' else 'in_progress' end,
         updated_at = now()
   where user_id = p_user_id
  returning status into v_status;

  return v_status;
end;
$$;

/** Jobs a scheduled run should try: unfinished, not held, oldest first. */
create or replace function public.due_deletion_jobs(p_limit integer)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select user_id
    from public.deletion_jobs
   where status in ('pending', 'in_progress')
     and (lease_until is null or lease_until <= now())
   order by requested_at
   limit p_limit;
$$;

/**
 * Removes everything the account owns in the database, in one transaction.
 *
 * The order follows docs/architecture/deletion-data-map.md, with two changes
 * found on 17 September 2026:
 *
 * - `check_jobs` go first. A spent check points at its ledger row with
 *   `ON DELETE SET NULL`; deleting the ledger would update those rows, and the
 *   late-write guard refuses any update for an account that is not `active`.
 * - The payment tables moved to `retired` on 10 September still hold the
 *   account: `retired.transactions` restricts deleting the Auth user and
 *   `retired.credit_transactions` blocks deleting the profile. Both are
 *   financial records, so they are archived like the ledger, not dropped.
 *
 * Safe to repeat: every insert into the archive ignores rows already there, and
 * every delete of rows already gone deletes nothing.
 */
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

  delete from public.check_jobs where user_id = p_user_id;

  perform public.archive_account_financials(p_user_id);

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transaction_status_events', e.id, e.created_at, to_jsonb(e)
    from retired.transaction_status_events e
    join retired.transactions t on t.id = e.transaction_id
   where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transactions', t.id, t.created_at, to_jsonb(t)
    from retired.transactions t
   where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  -- Status events go with their transaction by cascade.
  delete from retired.transactions where user_id = p_user_id;

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select c.user_id, 'credit_transactions', c.id, c.created_at at time zone 'UTC', to_jsonb(c)
    from retired.credit_transactions c
   where c.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  delete from retired.credit_transactions where user_id = p_user_id;

  delete from public.symptom_checks where user_id = p_user_id;
  delete from public.pets where user_id = p_user_id;
  -- user_feedback goes with the profile by cascade.
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.claim_deletion_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_deletion_job(uuid, integer) to service_role;

revoke all on function public.mark_deletion_step(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_deletion_step(uuid, text) to service_role;

revoke all on function public.record_deletion_failure(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.record_deletion_failure(uuid, text, integer) to service_role;

revoke all on function public.due_deletion_jobs(integer) from public, anon, authenticated;
grant execute on function public.due_deletion_jobs(integer) to service_role;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
