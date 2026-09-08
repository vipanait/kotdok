-- Let an account go without throwing its bookkeeping away.
--
-- `transactions.user_id` and `credit_ledger.user_id` are `ON DELETE RESTRICT`,
-- and that is deliberate: money moved, and a row saying so must not vanish
-- because somebody pressed a button. But it means deleting a user who ever
-- bought anything fails outright — confirmed by experiment, open question 3.15
-- — and stage 8 cannot let account deletion depend on whether a person has
-- ever paid us.
--
-- The plan allowed two ways out: delete the permissible rows, or keep a minimal
-- detached archive. This takes the archive. Deleting is not available to us —
-- how long a financial record must be kept is open question 1.7, and until a
-- jurisdiction is named, discarding is a decision nobody has authority to make.
-- An archive is safe under either answer: it survives while the obligation is
-- unknown, and `purge_after` is where the answer goes when it arrives.
--
-- What makes it detached: no foreign key to `auth.users`, and no column that
-- describes the person. The only link back is `subject_ref`, the identifier the
-- account used to have. After deletion it points at nothing — Auth is gone —
-- which is exactly the property that makes the archive minimal rather than a
-- second copy of the profile.
--
-- This migration only makes the archive possible. Running it is stage 8/05.

create table if not exists public.financial_archive (
  id uuid primary key default gen_random_uuid(),

  -- The account this belonged to. Deliberately not a foreign key: the row has
  -- to outlive the account, which is the whole point.
  subject_ref uuid not null,

  -- Which table the row came from, so a dispute can be reconstructed without
  -- guessing at the shape of `record`.
  source text not null,

  -- The primary key it had. Together with `source` it makes re-archiving the
  -- same row a no-op rather than a duplicate.
  source_id uuid not null,

  -- When the money moved, not when we filed it. Retention is counted from the
  -- event, so this cannot be `archived_at`.
  occurred_at timestamptz not null,

  -- The row as it stood, minus nothing and plus nothing. Kept as jsonb rather
  -- than mirrored columns so a later change to `transactions` cannot silently
  -- start dropping fields on the way in.
  record jsonb not null,

  archived_at timestamptz not null default now(),

  -- When this row itself may go. Null while open question 1.7 is open: a null
  -- says "nobody has decided yet", which is true, where a date would be a
  -- number somebody made up.
  purge_after timestamptz
);

alter table public.financial_archive
  drop constraint if exists financial_archive_source_check;
alter table public.financial_archive
  add constraint financial_archive_source_check
  check (source in (
    'transactions',
    'transaction_status_events',
    'credit_ledger',
    'credit_transactions'
  ));

create unique index if not exists financial_archive_source_row_idx
  on public.financial_archive (source, source_id);

create index if not exists financial_archive_subject_idx
  on public.financial_archive (subject_ref, occurred_at desc);

-- For the eventual purge, once there is a rule to purge by.
create index if not exists financial_archive_purge_idx
  on public.financial_archive (purge_after)
  where purge_after is not null;

alter table public.financial_archive enable row level security;

-- No policies, and no grants. This is bookkeeping about a person who has asked
-- to be forgotten; the only thing that should ever read it is a human answering
-- a payment dispute, through the service role.
revoke all on public.financial_archive from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Moving one account's financial rows into the archive.
-- ---------------------------------------------------------------------------

/**
 * Copies every financial row belonging to `p_user_id` into the archive and
 * deletes the originals, so that deleting the user no longer hits `RESTRICT`.
 *
 * One transaction, and ordered by what points at what. `credit_ledger` is
 * first because it is the one table that holds both `symptom_checks` and
 * `transactions`; anything else first would deadlock against its own foreign
 * keys. `extra_check_requests` has to release its `granted_ledger_id` before
 * the ledger can move, and it is deleted rather than archived — a request for
 * one more free check is not a financial record.
 *
 * Returns how many rows were archived, so the cleanup job can record progress
 * rather than trust that it ran.
 *
 * Idempotent: run it twice and the second run archives nothing and deletes
 * nothing, because the first left no rows behind and the archive refuses a
 * duplicate `(source, source_id)`. That matters — stage 8/05 retries every
 * step after a failure, and a step that cannot be repeated is a step that
 * cannot be recovered.
 */
create or replace function public.archive_account_financials(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archived integer := 0;
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'archive_account_financials requires a user id';
  end if;

  -- Frees `credit_ledger` to move. Not archived: this table records that
  -- somebody asked for a free check, which is support, not accounting.
  delete from public.extra_check_requests where user_id = p_user_id;

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select l.user_id, 'credit_ledger', l.id, l.created_at, to_jsonb(l)
  from public.credit_ledger l
  where l.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  get diagnostics v_count = row_count;
  v_archived := v_archived + v_count;

  delete from public.credit_ledger where user_id = p_user_id;

  -- Status events go with their transaction. Archived before it, because the
  -- delete below takes them with it by cascade.
  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transaction_status_events', e.id, e.created_at, to_jsonb(e)
  from public.transaction_status_events e
  join public.transactions t on t.id = e.transaction_id
  where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  get diagnostics v_count = row_count;
  v_archived := v_archived + v_count;

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transactions', t.id, t.created_at, to_jsonb(t)
  from public.transactions t
  where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  get diagnostics v_count = row_count;
  v_archived := v_archived + v_count;

  -- `transactions.current_status_event_id` points into the events table, which
  -- cascades from the transaction itself. Deleting the transaction takes both.
  delete from public.transactions where user_id = p_user_id;

  -- Billing v1, superseded but not migrated. Its rows are still receipts.
  -- `created_at` is nullable here where the v2 tables have a default, so the
  -- archive falls back to filing time rather than refusing a null.
  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select c.user_id, 'credit_transactions', c.id, coalesce(c.created_at, now()), to_jsonb(c)
  from public.credit_transactions c
  where c.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  get diagnostics v_count = row_count;
  v_archived := v_archived + v_count;

  delete from public.credit_transactions where user_id = p_user_id;

  return v_archived;
end;
$$;

revoke all on function public.archive_account_financials(uuid) from public, anon, authenticated;
