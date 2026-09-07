-- The record of one analysis being run.
--
-- The contract has said since stage 1 that creating a check returns a job and
-- not a result, and that `job_id` and `check_id` are never the same identifier.
-- Nothing implemented it, so the phone had no way to ask for an analysis at
-- all: `POST /api/v1/checks` did not exist and the site went on using its own
-- older route.
--
-- The work still happens inside the request — the owner moved photographs and
-- the background worker that comes with them to the end of the queue, so there
-- is nothing to hand the job to yet. The table is what makes that an
-- implementation detail instead of a promise broken in public: a client polls
-- the job either way, and stage 6 only has to stop doing the work inline.
--
-- It also gives failures somewhere to live. An analysis that dies halfway
-- through is a job that ended `failed` with a code, not an HTTP error the
-- caller has to interpret.

create table if not exists public.check_jobs (
  id uuid primary key default gen_random_uuid(),

  -- Cascading on purpose. The account deletion work of stage 8 is already held
  -- up by three tables that refuse to let a user go (open question 3.15), and a
  -- record of work done is not a reason to add a fourth.
  user_id uuid not null references auth.users(id) on delete cascade,

  status text not null default 'queued',

  -- Null until the analysis succeeded. Cascading too: a job pointing at a check
  -- that no longer exists describes nothing.
  check_id uuid references public.symptom_checks(id) on delete cascade,

  -- Set only on failure, and only to a code from the contract, so the client can
  -- branch on it rather than read a message.
  error_code text,

  -- What makes a retry safe. A phone that loses its answer and asks again must
  -- not spend a second credit on the same question.
  idempotency_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.check_jobs
  drop constraint if exists check_jobs_status_check;
alter table public.check_jobs
  add constraint check_jobs_status_check
  check (status in ('queued', 'processing', 'completed', 'failed'));

-- One key, one job, per person. Partial because most jobs carry no key: the
-- header is optional, and a null would otherwise collide with every other null.
create unique index if not exists check_jobs_idempotency_idx
  on public.check_jobs (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists check_jobs_user_created_idx
  on public.check_jobs (user_id, created_at desc);

alter table public.check_jobs enable row level security;

-- No policies: only the service role touches this table. Reads go through
-- /api/v1/check-jobs, which checks ownership itself, and the lockdown migration
-- already took write privileges away from anon and authenticated.
revoke all on public.check_jobs from anon, authenticated;
