-- How long the record of a deletion outlives the deletion.
--
-- Stage 8/04 wants two things that pull against each other. The job and the
-- receipt must survive the removal of the Auth user — they are what a retry
-- resumes from and what tells the person the work finished — and they must not
-- survive indefinitely, because they are still a record about somebody who
-- asked to be forgotten.
--
-- The first half is already true: `deletion_jobs` has no foreign key to
-- `auth.users`, so deleting the user leaves the job standing. This adds the
-- second half.

alter table public.deletion_jobs
  add column if not exists retain_until timestamptz;

comment on column public.deletion_jobs.retain_until is
  'When this record may be removed. Null means nobody has decided yet — see open question 1.8.';

create index if not exists deletion_jobs_retention_idx
  on public.deletion_jobs (retain_until)
  where retain_until is not null;

/**
 * Removes the records whose retention has run out.
 *
 * Null is not "expired", it is "undecided", and the difference matters: the
 * published deletion deadline is open question 1.8, and until it is answered
 * nobody here has the standing to pick a number. A row with no `retain_until`
 * is therefore kept, not swept — the same choice `financial_archive.purge_after`
 * makes, for the same reason.
 *
 * Only finished work is eligible. A job still pending or waiting on a person is
 * not a leftover, however old it is: throwing it away would lose the deletion
 * itself, which is the one outcome worse than keeping the record too long.
 *
 * Returns how many rows went, so a scheduled run can be seen to have done
 * something rather than assumed to have.
 */
create or replace function public.purge_expired_deletion_jobs(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer;
begin
  delete from public.deletion_jobs
   where status = 'completed'
     and retain_until is not null
     and retain_until <= p_now;

  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.purge_expired_deletion_jobs(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_expired_deletion_jobs(timestamptz) to service_role;

/**
 * Marks a job finished and starts its retention clock.
 *
 * The clock is started here rather than at the request, because the promise
 * made to the person is about the finish: the receipt has to stay readable long
 * enough after the work ends for them to see that it ended.
 *
 * `p_retain_for` is passed in rather than defaulted, so the published deadline
 * lives in one place the owner can point at, and a null goes in — deliberately —
 * while there is no such deadline.
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
begin
  update public.deletion_jobs
     set status = 'completed',
         completed_at = now(),
         updated_at = now(),
         retain_until = case when p_retain_for is null then null else now() + p_retain_for end,
         error_code = null
   where user_id = p_user_id
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke all on function public.complete_deletion_job(uuid, interval) from public, anon, authenticated;
grant execute on function public.complete_deletion_job(uuid, interval) to service_role;
