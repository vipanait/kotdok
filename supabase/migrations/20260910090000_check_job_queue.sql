-- ---------------------------------------------------------------------------
-- The analysis becomes a job somebody picks up, instead of work done inline.
-- ---------------------------------------------------------------------------
--
-- Until now `check_jobs` recorded an analysis that had already happened inside
-- the request. That kept the contract honest but gave none of what stage 6 asks
-- for: a check that survives the request dying, one charge per result, and a
-- returned check when the analysis finally gives up.
--
-- The design is the one already worked out in
-- `docs/architecture/jobs-uploads-deletion.md`, section 2:
--
--   queued -> processing   a worker claims it atomically and holds a lease
--   processing -> completed  result, ledger link and final state, one transaction
--   processing -> failed     attempts exhausted; the check is returned in the same
--                            transaction
--   processing -> queued     the lease expired; attempts incremented, try again
--
-- Only the holder of the current lease may finish a job. A worker the platform
-- killed mid-call comes back to find the job taken and writes nothing.

-- ---------------------------------------------------------------------------
-- What a job now carries.
-- ---------------------------------------------------------------------------

alter table public.check_jobs
  -- What to analyse. The request that created the job is long gone by the time
  -- a worker runs, so the job has to hold its own inputs.
  add column if not exists payload jsonb not null default '{}'::jsonb,

  -- The fingerprint of those inputs. The same key with different data is a
  -- different request wearing a used name, and gets a conflict rather than
  -- somebody else's answer.
  add column if not exists payload_fingerprint text,

  -- Who holds it and until when. Null when nobody does.
  add column if not exists claimed_by text,
  add column if not exists lease_expires_at timestamptz,

  -- How many times a worker has taken it. Not how many times it failed: a
  -- worker killed by the platform never reports anything, and that attempt has
  -- to count or the job retries for ever.
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 2,

  -- The ledger row that reserved the check, so completion can point it at the
  -- result and failure can return it exactly once.
  add column if not exists usage_ledger_id uuid references public.credit_ledger(id) on delete set null;

comment on column public.check_jobs.max_attempts is
  'Two by default: one retry. Every attempt is a paid call to the model, so this is a budget decision before it is a reliability one.';

-- A job is claimable when it is queued, or when it is processing with a lease
-- that has run out. The index covers both without scanning the finished ones.
create index if not exists check_jobs_claimable_idx
  on public.check_jobs (status, lease_expires_at)
  where status in ('queued', 'processing');

-- ---------------------------------------------------------------------------
-- Taking a job.
-- ---------------------------------------------------------------------------

/**
 * Hands one job to one worker, or nothing.
 *
 * `for update skip locked` is what makes several triggers safe at once — the
 * creating request, the status poll and the sweeper may all reach for work in
 * the same moment, and each either gets a different job or gets none.
 *
 * A job whose lease has expired is claimable again, and claiming it counts as
 * another attempt. Past `max_attempts` it is not offered: `recover_stuck_jobs`
 * is what finally fails it, so that giving up and returning the check happen in
 * one place.
 */
create or replace function public.claim_check_job(
  p_worker text,
  p_lease_seconds integer default 360
)
returns public.check_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.check_jobs;
begin
  if p_worker is null or length(p_worker) = 0 then
    raise exception 'claim_check_job requires a worker id';
  end if;

  select * into v_job
  from public.check_jobs
  where (
      status = 'queued'
      or (status = 'processing' and lease_expires_at is not null and lease_expires_at < now())
    )
    and attempts < max_attempts
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.check_jobs
  set status = 'processing',
      claimed_by = p_worker,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempts = attempts + 1,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.claim_check_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_check_job(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Finishing one.
-- ---------------------------------------------------------------------------

/**
 * Records the result and closes the job, in one statement and only for the
 * worker that still holds it.
 *
 * The check the analysis produced is written by the caller before this runs;
 * what happens here is the part that must not half-happen — the job going
 * `completed`, the ledger row learning which check it paid for, and the lease
 * being released.
 *
 * @returns true when this worker's lease was still current. False means another
 *   worker has since taken the job, and this one must discard what it computed.
 */
create or replace function public.complete_check_job(
  p_job_id uuid,
  p_worker text,
  p_check_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id uuid;
begin
  update public.check_jobs
  set status = 'completed',
      check_id = p_check_id,
      claimed_by = null,
      lease_expires_at = null,
      error_code = null,
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and claimed_by = p_worker
    and lease_expires_at > now()
  returning usage_ledger_id into v_ledger_id;

  if not found then
    return false;
  end if;

  -- The reservation was made before anybody knew what it would buy.
  if v_ledger_id is not null then
    update public.credit_ledger
    set symptom_check_id = p_check_id
    where id = v_ledger_id;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_check_job(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.complete_check_job(uuid, text, uuid) to service_role;

/**
 * Gives the job back, or gives it up.
 *
 * `p_final` is the difference between "this attempt did not work" and "this is
 * not going to work". A job that is not final returns to `queued` for whatever
 * attempts remain; a final one fails and returns the check in the same
 * transaction, because a person who was charged for an answer they will never
 * receive is the one failure mode worth ruling out entirely.
 *
 * Returning the check goes through `refund_symptom_check_usage`, which is
 * already idempotent per ledger row — so a retried failure report cannot pay
 * out twice.
 *
 * @returns true when this worker still held the job.
 */
create or replace function public.fail_check_job(
  p_job_id uuid,
  p_worker text,
  p_error_code text,
  p_final boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.check_jobs;
  v_final boolean;
begin
  select * into v_job
  from public.check_jobs
  where id = p_job_id
    and status = 'processing'
    and claimed_by = p_worker
    and lease_expires_at > now()
  for update;

  if not found then
    return false;
  end if;

  v_final := p_final or v_job.attempts >= v_job.max_attempts;

  update public.check_jobs
  set status = case when v_final then 'failed' else 'queued' end,
      error_code = p_error_code,
      claimed_by = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_job_id;

  if v_final and v_job.usage_ledger_id is not null then
    perform public.refund_symptom_check_usage(
      v_job.user_id,
      v_job.usage_ledger_id,
      coalesce(p_error_code, 'analysis_failed')
    );
  end if;

  return true;
end;
$$;

revoke all on function public.fail_check_job(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_check_job(uuid, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- The jobs nobody came back for.
-- ---------------------------------------------------------------------------

/**
 * Puts expired leases back in the queue, and fails the ones that have run out
 * of attempts.
 *
 * This exists because the usual worker cannot report its own death. A function
 * the platform killed at 300 seconds leaves a row saying `processing` with a
 * lease that quietly stops being true, and nothing else in the system would
 * ever look at it again.
 *
 * `p_now` is a parameter so the behaviour can be tested without waiting six
 * minutes for a lease to expire.
 *
 * @returns how many jobs were moved, so the caller can log progress rather than
 *   trust that it ran.
 */
create or replace function public.recover_stuck_check_jobs(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer := 0;
  v_count integer;
  v_job record;
begin
  -- Out of attempts: give up and give the check back.
  for v_job in
    select id, user_id, usage_ledger_id, error_code
    from public.check_jobs
    where status = 'processing'
      and lease_expires_at is not null
      and lease_expires_at < p_now
      and attempts >= max_attempts
    for update skip locked
  loop
    update public.check_jobs
    set status = 'failed',
        error_code = coalesce(v_job.error_code, 'analysis_timeout'),
        claimed_by = null,
        lease_expires_at = null,
        updated_at = p_now
    where id = v_job.id;

    if v_job.usage_ledger_id is not null then
      perform public.refund_symptom_check_usage(
        v_job.user_id,
        v_job.usage_ledger_id,
        'analysis_timeout'
      );
    end if;

    v_moved := v_moved + 1;
  end loop;

  -- Attempts left: back in the queue for somebody else.
  update public.check_jobs
  set status = 'queued',
      claimed_by = null,
      lease_expires_at = null,
      updated_at = p_now
  where status = 'processing'
    and lease_expires_at is not null
    and lease_expires_at < p_now
    and attempts < max_attempts;

  get diagnostics v_count = row_count;

  return v_moved + v_count;
end;
$$;

revoke all on function public.recover_stuck_check_jobs(timestamptz) from public, anon, authenticated;
grant execute on function public.recover_stuck_check_jobs(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Accepting one.
-- ---------------------------------------------------------------------------

/**
 * Checks the account, reserves the check and records the job — or does none of
 * those things.
 *
 * This is the transaction stage 6/05 asks for. Split across statements from the
 * application, a crash between them leaves either a charge with no job or a job
 * nobody paid for; here there is no between.
 *
 * Idempotency is settled in the same breath, because that is the other way the
 * same request becomes two charges:
 *
 *   same key, same data   the job that already exists, and no second charge
 *   same key, other data  `conflict`, and nothing written
 *
 * @returns `{ status, job_id, balance }`. `status` is one of `created`,
 *   `reused`, `conflict`, `inactive`, `insufficient_credits`.
 */
create or replace function public.enqueue_check_job(
  p_user_id uuid,
  p_payload jsonb,
  p_fingerprint text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.check_jobs;
  v_status text;
  v_usage jsonb;
  v_job_id uuid;
begin
  if p_user_id is null then
    raise exception 'enqueue_check_job requires a user id';
  end if;

  -- Locked, not merely read: the same account asking twice at once must not
  -- pass this check twice and reserve two checks against one balance.
  select status into v_status
  from public.profiles
  where id = p_user_id
  for update;

  if v_status is distinct from 'active' then
    return jsonb_build_object('status', 'inactive');
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.check_jobs
    where user_id = p_user_id and idempotency_key = p_idempotency_key;

    if found then
      if v_existing.payload_fingerprint is distinct from p_fingerprint then
        return jsonb_build_object('status', 'conflict');
      end if;
      return jsonb_build_object('status', 'reused', 'job_id', v_existing.id);
    end if;
  end if;

  begin
    v_usage := public.apply_symptom_check_usage(p_user_id, null);
  exception when others then
    if sqlerrm like '%insufficient_credits%' then
      return jsonb_build_object('status', 'insufficient_credits');
    end if;
    raise;
  end;

  insert into public.check_jobs
    (user_id, status, idempotency_key, payload, payload_fingerprint, usage_ledger_id)
  values
    (p_user_id, 'queued', p_idempotency_key, p_payload, p_fingerprint, (v_usage->>'ledger_id')::uuid)
  returning id into v_job_id;

  return jsonb_build_object(
    'status', 'created',
    'job_id', v_job_id,
    'balance', (v_usage->>'new_balance')::integer
  );
end;
$$;

revoke all on function public.enqueue_check_job(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_check_job(uuid, jsonb, text, text) to service_role;
