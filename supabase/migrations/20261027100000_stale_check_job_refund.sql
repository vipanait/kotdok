-- A check job whose function died gives back the credit it reserved.
--
-- The analysis reserves a credit before calling the model and refunds it in
-- its own catch block when anything goes wrong. A function the platform ends
-- (maxDuration) or that crashes between the two never reaches that block: the
-- job stays `processing` and the credit is gone. The reader of the job reports
-- such a job as failed after five minutes, and the phone then offers to try
-- again — which, with the credit still spent, would cost the owner twice.
--
-- So the reservation is recorded on the job it was made for, in the same
-- transaction, and closing a dead job returns that reservation in the same
-- transaction as it fails the job. The job's row lock makes it happen once
-- however many polls find the job at the same moment.

alter table public.check_jobs
  add column if not exists usage_ledger_id uuid
    references public.credit_ledger(id) on delete set null;

comment on column public.check_jobs.usage_ledger_id is
  'The credit_ledger usage row the analysis of this job reserved; returned by fail_stale_check_job if the job dies.';

-- The analysis's reservation, for a job: the credit is taken and the job
-- remembers which ledger row took it, or neither happens.
create or replace function public.reserve_check_job_credit(
  p_user_id uuid,
  p_job_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage jsonb;
begin
  v_usage := public.apply_symptom_check_usage(p_user_id, null);

  update public.check_jobs
    set usage_ledger_id = (v_usage ->> 'ledger_id')::uuid
    where id = p_job_id and user_id = p_user_id;
  if not found then
    raise exception 'check_job_not_found';
  end if;

  return v_usage;
end;
$$;

-- Closes the caller's job if it has been `processing` longer than its function
-- can live, returning the credit it reserved. Returns the job's status after
-- the call ('failed' when it was closed now or before, otherwise what it is),
-- or null when the job is not this person's.
create or replace function public.fail_stale_check_job(
  p_user_id uuid,
  p_job_id uuid,
  p_stale_after_seconds integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.check_jobs%rowtype;
begin
  select * into v_job
    from public.check_jobs
    where id = p_job_id and user_id = p_user_id
    for update;
  if not found then
    return null;
  end if;

  if v_job.status <> 'processing'
     or v_job.updated_at > now() - make_interval(secs => p_stale_after_seconds) then
    return v_job.status;
  end if;

  update public.check_jobs
    set status = 'failed', error_code = 'internal_error', updated_at = now()
    where id = v_job.id;

  if v_job.usage_ledger_id is not null then
    begin
      perform public.refund_symptom_check_usage(p_user_id, v_job.usage_ledger_id, 'stale_check_job');
    exception when others then
      -- The usage row can be gone (an account being erased archives it), or
      -- the account is closing and takes no credits. The job is closed all
      -- the same: there is nothing to give back to.
      if sqlerrm not in ('usage_ledger_not_found', 'account is not accepting credits') then
        raise;
      end if;
    end;
  end if;

  return 'failed';
end;
$$;

revoke execute on function public.reserve_check_job_credit(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fail_stale_check_job(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_check_job_credit(uuid, uuid) to service_role;
grant execute on function public.fail_stale_check_job(uuid, uuid, integer) to service_role;
