-- Proving somebody is still there, and accepting the request to delete them.
--
-- Two tables and one function, because the two questions are separate. Whether
-- the person at the keyboard authenticated a minute ago is stage 5/08. Whether
-- the account is now being deleted is stage 8/03. Mixing them would mean a
-- deletion request that carries its own proof of authority, which is the shape
-- of every replay attack.

-- ---------------------------------------------------------------------------
-- Proof of a fresh authentication, spent once.
-- ---------------------------------------------------------------------------

/*
 * What it is for.
 *
 * Deleting an account is not a thing to allow on the strength of a session
 * that has been alive for a month. The plan asks for "a separate server-side
 * proof of fresh authentication, bound to the user and the operation, with a
 * limited lifetime and a single use", and says in as many words that a token
 * refresh and a client-side "confirmed" flag do not qualify.
 *
 * Freshness is read from the access token's `amr` claim, which records when
 * the person actually authenticated. Measured on staging: signing in gave
 * `amr[0].timestamp = 1788951480` with `iat = 1788951480`; a refresh three
 * seconds later moved `iat` to 1788951483 and left `amr` where it was. So the
 * claim cannot be freshened by refreshing, which is precisely the property the
 * acceptance demands — and it works the same for a password, for Google and
 * for Yandex, because every method writes its own `amr` entry.
 *
 * This table holds only the consequence: the server saw a fresh
 * authentication, so here is one token, good for one operation, once.
 */
create table if not exists public.reauth_proofs (
  id uuid primary key default gen_random_uuid(),

  -- Cascading. A proof belongs to a session's owner and means nothing without
  -- them; unlike the deletion job below, it has no reason to outlive the user.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What it may authorise, and only that. A proof minted for one operation
  -- must not open another.
  operation text not null,

  -- Only the hash. The token itself is returned to the caller once and never
  -- stored, so a copy of this table is not a set of usable proofs.
  token_hash text not null unique,

  expires_at timestamptz not null,

  -- Set the moment it is spent. Nullable rather than a delete so a replay can
  -- be told apart from a token that never existed.
  consumed_at timestamptz,

  created_at timestamptz not null default now()
);

alter table public.reauth_proofs
  drop constraint if exists reauth_proofs_operation_check;
alter table public.reauth_proofs
  add constraint reauth_proofs_operation_check
  check (operation in ('account_deletion'));

create index if not exists reauth_proofs_expiry_idx on public.reauth_proofs (expires_at);

alter table public.reauth_proofs enable row level security;
revoke all on public.reauth_proofs from anon, authenticated;

/**
 * Spends a proof, or refuses.
 *
 * The check and the consumption are one statement on purpose: two requests
 * arriving together must not both find it unspent. `consumed_at is null` in the
 * `where` clause is what makes the second one update nothing.
 */
create or replace function public.consume_reauth_proof(
  p_user_id uuid,
  p_operation text,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.reauth_proofs
     set consumed_at = now()
   where token_hash = p_token_hash
     and user_id = p_user_id
     and operation = p_operation
     and consumed_at is null
     and expires_at > now()
  returning id into v_id;

  return v_id is not null;
end;
$$;

-- Taken away from everyone, then given back to the one role that may call it.
-- Revoking from `public` alone is not enough and not too much: `service_role`
-- inherits its execute right from there, so without the grant below the
-- trusted server is locked out along with everybody else.
revoke all on function public.consume_reauth_proof(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_reauth_proof(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- The cleanup job.
-- ---------------------------------------------------------------------------

/*
 * Deliberately no foreign key to `auth.users`.
 *
 * Stage 8/04 requires that the job and the receipt survive the deletion of the
 * Auth user: they are what a retry resumes from and what tells the person the
 * work finished. A cascade would delete the record of the work at the exact
 * moment the work is nearly done, and a `restrict` would put the job in the way
 * of the deletion it exists to perform. So the column is a plain identifier,
 * like `financial_archive.subject_ref`, and for the same reason.
 */
create table if not exists public.deletion_jobs (
  id uuid primary key default gen_random_uuid(),

  -- One per account, ever. A deleted account does not come back, so there is
  -- no second request to make; this is also what makes a repeat harmless.
  user_id uuid not null unique,

  status text not null default 'pending',

  -- Only the hash of the client's receipt secret. The secret is generated on
  -- the device before the request and never sent anywhere else, so a status
  -- check works after the session is gone — and this table cannot be read to
  -- impersonate a receipt.
  receipt_hash text not null,

  -- How far the cleanup got, so a retry resumes rather than restarts. Shape is
  -- the worker's business (stage 8/05); it is opaque here.
  progress jsonb not null default '{}'::jsonb,

  -- Set when a step needs a human: an external service refused and no retry
  -- will fix it. Never a synonym for completed.
  error_code text,

  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.deletion_jobs
  drop constraint if exists deletion_jobs_status_check;
alter table public.deletion_jobs
  add constraint deletion_jobs_status_check
  check (status in ('pending', 'in_progress', 'action_required', 'completed'));

create index if not exists deletion_jobs_status_idx
  on public.deletion_jobs (status)
  where status <> 'completed';

create unique index if not exists deletion_jobs_receipt_idx on public.deletion_jobs (receipt_hash);

alter table public.deletion_jobs enable row level security;
revoke all on public.deletion_jobs from anon, authenticated;

/**
 * Accepts a deletion request: marks the account and records the job, together.
 *
 * One statement each, one transaction, and idempotent. Ten requests arriving at
 * once produce one job and one `deleting` account — the unique key on `user_id`
 * decides which insert wins, and the rest fall through `on conflict do nothing`
 * rather than raising. A repeat is not an error: the caller asked for the
 * account to be deleted and it is being deleted.
 *
 * Returns false only when the request cannot be honoured — an account that no
 * longer exists. A second request from the same person returns true, because
 * from where they stand nothing is wrong.
 */
create or replace function public.request_account_deletion(
  p_user_id uuid,
  p_receipt_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  select true into v_exists from public.profiles where id = p_user_id;
  if v_exists is not true then
    return false;
  end if;

  -- Closes every ordinary path first. The write lockdown from stage 1 refuses
  -- anything but an active account, so this line is what stops new work from
  -- being accepted while the cleanup runs.
  update public.profiles set status = 'deleting' where id = p_user_id;

  insert into public.deletion_jobs (user_id, receipt_hash)
  values (p_user_id, p_receipt_hash)
  on conflict (user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.request_account_deletion(uuid, text) from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid, text) to service_role;
