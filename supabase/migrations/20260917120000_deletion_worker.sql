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

/**
 * Records that a step finished, so a retry does not run it again.
 *
 * Guarded like `claim_deletion_job`: a runner whose lease already expired must
 * not go on writing into a job a later run has since finished or handed to a
 * person. `status in ('pending', 'in_progress')` in the `where` is that guard;
 * finding nothing to update there is treated as an error, not a silent no-op,
 * because a step that appears to succeed but changed nothing would tell the
 * caller it may move on to the next step when it may not.
 */
create or replace function public.mark_deletion_step(p_user_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_step not in ('data', 'auth') then
    raise exception 'unknown deletion step %', p_step using errcode = 'invalid_parameter_value';
  end if;

  update public.deletion_jobs
     set progress = progress || jsonb_build_object(p_step, now()),
         updated_at = now()
   where user_id = p_user_id
     and status in ('pending', 'in_progress');

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'no active deletion job for %', p_user_id using errcode = 'no_data_found';
  end if;
end;
$$;

/**
 * Counts a failed attempt and lets go of the job.
 *
 * Below the limit the job stays `in_progress` with no lease, so the next run —
 * the cron at the latest — picks it up. At the limit it becomes
 * `action_required`: a person has to look, and the status says so instead of
 * pretending the deletion finished.
 *
 * Guarded like `mark_deletion_step`: a stale runner must not count an attempt
 * against, or otherwise touch, a job that has since completed or moved to
 * `action_required` by another run. When the guard stops the update, the job's
 * current status is looked up and returned instead — the caller still gets an
 * answer, just not one that pretends this call changed anything.
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
     and status in ('pending', 'in_progress')
  returning status into v_status;

  if v_status is null then
    select status into v_status from public.deletion_jobs where user_id = p_user_id;
  end if;

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
 * - `check_jobs` go first. On production, `check_jobs.usage_ledger_id` points
 *   at its ledger row with `ON DELETE SET NULL` — added by
 *   `20260910090000_check_job_queue` on the unmerged `server/stage-6-job-reliability`
 *   branch, which is already applied there even though this branch's schema
 *   does not have the column yet. Deleting the ledger would update those rows,
 *   and the late-write guard refuses any update for an account that is not
 *   `active`. Deleting `check_jobs` first is required on production for that
 *   reason, and harmless here: on this branch's schema `check_jobs` has no
 *   such column, and the delete simply removes the job records.
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

  delete from public.symptom_checks where user_id = p_user_id;
  delete from public.pets where user_id = p_user_id;
  -- user_feedback goes with the profile by cascade.
  delete from public.profiles where id = p_user_id;
end;
$$;

/**
 * Marks a job finished and starts its retention clock.
 *
 * Redefined here from `20260909140000_deletion_job_retention.sql` with one
 * change: the same stale-runner guard as `mark_deletion_step` and
 * `record_deletion_failure` above. `p_retain_for` is passed in rather than
 * defaulted, so the published deadline lives in one place the owner can point
 * at, and a null goes in — deliberately — while there is no such deadline.
 *
 * A runner whose lease already expired must not re-complete, and re-stamp
 * `completed_at` on, a job a later run already finished or that has since
 * moved to `action_required`. When the guard stops the update, this returns
 * `true` if the job is already `completed` — the caller asked for a finished
 * job and has one, even though this call did not produce it — and `false`
 * otherwise (waiting on a person, or no such job at all).
 */
create or replace function public.complete_deletion_job(
  p_user_id uuid,
  p_retain_for interval default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
begin
  update public.deletion_jobs
     set status = 'completed',
         completed_at = now(),
         updated_at = now(),
         retain_until = case when p_retain_for is null then null else now() + p_retain_for end,
         error_code = null
   where user_id = p_user_id
     and status in ('pending', 'in_progress')
  returning id into v_id;

  if v_id is not null then
    return true;
  end if;

  select status into v_status from public.deletion_jobs where user_id = p_user_id;
  return coalesce(v_status = 'completed', false);
end;
$$;

revoke all on function public.complete_deletion_job(uuid, interval) from public, anon, authenticated;
grant execute on function public.complete_deletion_job(uuid, interval) to service_role;

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
