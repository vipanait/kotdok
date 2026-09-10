-- ---------------------------------------------------------------------------
-- Payments leave the product.
-- ---------------------------------------------------------------------------
--
-- Owner's decision of 10 September 2026: this version has no payments. What
-- stays is how many checks a person has — two on registration, more on request
-- — because that is what keeps the AI bill finite. What goes is everything
-- about money: packages, saved cards, purchases and their status machine.
--
-- The tables move to a `retired` schema instead of being dropped. PostgREST
-- serves `public` and nothing else, so from the API and the app they are gone
-- either way; the difference is that this one is reversible. The project has
-- no backups at all — Supabase's Free plan does not include them — and these
-- rows are other people's payment records. A `drop` here would be the one
-- deletion in this repository that nothing could undo.
--
-- Dropping them for real is one line per table, once the row counts are known
-- and the owner says so.

create schema if not exists retired;

comment on schema retired is
  'Tables the product no longer uses, kept because this project has no backups. Not served by PostgREST. Safe to drop once their contents are known to be worthless.';

revoke all on schema retired from public;
revoke all on schema retired from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The payment RPCs.
-- ---------------------------------------------------------------------------
--
-- By name rather than by signature: these were rewritten twice across three
-- migrations, and a signature copied from the wrong one silently drops nothing.
-- `apply_symptom_check_usage` and `refund_symptom_check_usage` are deliberately
-- not in this list — spending and returning a check is what we are keeping.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_transaction',
        'mark_transaction_pending',
        'apply_transaction_success',
        'apply_transaction_terminal',
        'apply_refund'
      )
  loop
    execute format('drop function if exists %s', fn.signature);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The ledger keeps the count and loses the purchase.
-- ---------------------------------------------------------------------------
--
-- `credit_ledger` is the balance itself and stays in `public`. Only its link to
-- a purchase goes, and it has to go before the table it points at moves.
--
-- `credit_reason` keeps its `purchase` value: existing rows may carry it, and
-- PostgreSQL cannot remove a value from an enum in use. It simply becomes a
-- reason nothing new is written with.

alter table public.credit_ledger drop column if exists transaction_id;

-- ---------------------------------------------------------------------------
-- Out of the API's reach.
-- ---------------------------------------------------------------------------
--
-- Order follows the foreign keys: events point at transactions, transactions
-- point at packages and payment methods. Types move after the tables that use
-- them.

alter table if exists public.transaction_status_events set schema retired;
alter table if exists public.transactions set schema retired;
alter table if exists public.payment_methods set schema retired;
alter table if exists public.packages set schema retired;

-- Billing v1, superseded in April and never migrated. Same reasoning.
alter table if exists public.credit_transactions set schema retired;

alter type public.payment_provider set schema retired;
alter type public.tx_status set schema retired;

-- The account-status guard was installed on two of those tables. It travelled
-- with them, and a retired table needs no guard against writes it will never
-- receive.
drop trigger if exists refuse_late_writes on retired.transactions;
drop trigger if exists refuse_late_writes on retired.credit_transactions;

-- ---------------------------------------------------------------------------
-- Deleting an account, without the tables that are no longer there.
-- ---------------------------------------------------------------------------
--
-- `archive_account_financials` walked five tables. Three of them just left, so
-- it would fail on its next call — and its next call is part of deleting an
-- account, which is not where a failure should be discovered.
--
-- What remains is the ledger: it is the only financial record the product still
-- keeps, and `credit_ledger.user_id` is still `ON DELETE RESTRICT`, so it still
-- has to move out of the way before a user row can go.

create or replace function public.archive_account_financials(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archived integer := 0;
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

  get diagnostics v_archived = row_count;

  delete from public.credit_ledger where user_id = p_user_id;

  return v_archived;
end;
$$;

revoke all on function public.archive_account_financials(uuid) from public, anon, authenticated;
grant execute on function public.archive_account_financials(uuid) to service_role;
