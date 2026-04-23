-- Billing v2: packages catalog, transactions with status history, credit ledger,
-- payment methods for multi-provider (Tinkoff on start, Stripe/YooKassa ready).
--
-- IMPORTANT: If you had a stripe-era `payment_methods` table, rename it first:
--   alter table public.payment_methods rename to payment_methods_legacy;

-- ========== Enums ==========

do $$ begin
  create type public.payment_provider as enum ('tinkoff', 'stripe', 'yookassa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tx_status as enum ('created', 'pending', 'authorized', 'succeeded', 'failed', 'canceled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.credit_reason as enum ('purchase', 'usage', 'refund', 'admin_grant', 'signup_bonus');
exception when duplicate_object then null; end $$;

-- ========== packages ==========
-- Immutable catalog. Changing price = new row with new code; old rows stay so
-- historical transactions keep referencing the exact snapshot they were bought at.

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  units integer not null check (units > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  price_cents integer not null check (price_cents >= 0),
  currency char(3) not null default 'RUB',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.packages (code, name, units, unit_price_cents, price_cents, currency, sort_order) values
  ('pack_5_rub_v1',  '5 проверок',  5,  10000, 49000,  'RUB', 10),
  ('pack_15_rub_v1', '15 проверок', 15, 9000,  129000, 'RUB', 20),
  ('pack_50_rub_v1', '50 проверок', 50, 7000,  349000, 'RUB', 30)
on conflict (code) do nothing;

-- ========== payment_methods ==========
-- Saved cards per provider. For Tinkoff: provider_pm_id = RebillId.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.payment_provider not null,
  provider_pm_id text not null,
  brand text,
  last4 text,
  exp_month smallint,
  exp_year smallint,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (provider, provider_pm_id)
);

create index if not exists payment_methods_user_active_idx
  on public.payment_methods (user_id)
  where deleted_at is null;

-- ========== transactions ==========
-- One attempted purchase. Price snapshot lives on the row so it never drifts.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  provider public.payment_provider not null,
  provider_payment_id text,
  package_id uuid not null references public.packages(id),
  -- price snapshot at purchase time
  units_total integer not null check (units_total > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  amount_cents integer not null check (amount_cents >= 0),
  currency char(3) not null,
  -- denormalized current status for fast queries
  current_status public.tx_status not null default 'created',
  current_status_event_id uuid,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create index if not exists transactions_user_idx on public.transactions (user_id, created_at desc);
create index if not exists transactions_open_idx
  on public.transactions (current_status)
  where current_status in ('created', 'pending', 'authorized');

-- ========== transaction_status_events ==========
-- Append-only audit log. `provider_event_id` enforces webhook idempotency.

create table if not exists public.transaction_status_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  status public.tx_status not null,
  reason text,
  provider_event_id text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tx_events_transaction_idx
  on public.transaction_status_events (transaction_id, created_at);

alter table public.transactions
  drop constraint if exists transactions_current_status_event_fk;
alter table public.transactions
  add constraint transactions_current_status_event_fk
  foreign key (current_status_event_id) references public.transaction_status_events(id) on delete set null;

-- ========== credit_ledger ==========
-- Source of truth for balance movements. profiles.credits is a denormalized cache.

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  delta integer not null,
  reason public.credit_reason not null,
  transaction_id uuid references public.transactions(id),
  symptom_check_id uuid references public.symptom_checks(id),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

-- ========== RPC: create_transaction ==========
-- Inserts transaction (with price snapshot from package) + initial 'created' event.
-- Returns the new transaction id. Called from /api/billing/purchase.

create or replace function public.create_transaction(
  p_user_id uuid,
  p_provider public.payment_provider,
  p_package_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_payment_method_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pkg public.packages%rowtype;
  v_tx_id uuid;
  v_event_id uuid;
begin
  select * into v_pkg from public.packages where id = p_package_id;
  if not found then raise exception 'package_not_found'; end if;
  if not v_pkg.is_active then raise exception 'package_inactive'; end if;

  insert into public.transactions (
    user_id, provider, package_id,
    units_total, unit_price_cents, amount_cents, currency,
    metadata, payment_method_id
  ) values (
    p_user_id, p_provider, p_package_id,
    v_pkg.units, v_pkg.unit_price_cents, v_pkg.price_cents, v_pkg.currency,
    p_metadata, p_payment_method_id
  )
  returning id into v_tx_id;

  insert into public.transaction_status_events (transaction_id, status, reason)
  values (v_tx_id, 'created', 'user_initiated')
  returning id into v_event_id;

  update public.transactions set current_status_event_id = v_event_id where id = v_tx_id;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'amount_cents', v_pkg.price_cents,
    'currency', v_pkg.currency,
    'package_name', v_pkg.name
  );
end;
$$;

-- ========== RPC: mark_transaction_pending ==========
-- After provider Init succeeds: set provider_payment_id, move to 'pending'.

create or replace function public.mark_transaction_pending(
  p_transaction_id uuid,
  p_provider_payment_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.transaction_status_events (transaction_id, status, reason)
  values (p_transaction_id, 'pending', 'provider_init')
  returning id into v_event_id;

  update public.transactions set
    provider_payment_id = p_provider_payment_id,
    current_status = 'pending',
    current_status_event_id = v_event_id,
    updated_at = now()
  where id = p_transaction_id;

  return jsonb_build_object('event_id', v_event_id);
end;
$$;

-- ========== RPC: apply_transaction_success ==========
-- Called from webhook handler on 'succeeded' status.
-- Idempotent via provider_event_id. Performs in a single transaction:
--   - inserts status event
--   - updates transaction current_status
--   - upserts payment_method (if rebill data present)
--   - increments profiles.credits
--   - inserts credit_ledger entry

create or replace function public.apply_transaction_success(
  p_provider public.payment_provider,
  p_provider_payment_id text,
  p_provider_event_id text,
  p_payload jsonb default '{}'::jsonb,
  p_rebill_id text default null,
  p_card_last4 text default null,
  p_card_brand text default null,
  p_card_exp_month smallint default null,
  p_card_exp_year smallint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transactions%rowtype;
  v_event_id uuid;
  v_new_balance integer;
  v_pm_id uuid;
begin
  select * into v_tx from public.transactions
    where provider = p_provider and provider_payment_id = p_provider_payment_id
    for update;
  if not found then raise exception 'transaction_not_found'; end if;

  -- idempotency
  if p_provider_event_id is not null then
    perform 1 from public.transaction_status_events where provider_event_id = p_provider_event_id;
    if found then
      return jsonb_build_object('status', 'already_applied', 'transaction_id', v_tx.id);
    end if;
  end if;

  if v_tx.current_status = 'succeeded' then
    return jsonb_build_object('status', 'already_succeeded', 'transaction_id', v_tx.id);
  end if;
  if v_tx.current_status in ('refunded', 'canceled') then
    return jsonb_build_object('status', 'terminal_ignored', 'transaction_id', v_tx.id);
  end if;

  if p_rebill_id is not null then
    insert into public.payment_methods (user_id, provider, provider_pm_id, brand, last4, exp_month, exp_year)
    values (v_tx.user_id, p_provider, p_rebill_id, p_card_brand, p_card_last4, p_card_exp_month, p_card_exp_year)
    on conflict (provider, provider_pm_id) do update set
      brand = coalesce(excluded.brand, public.payment_methods.brand),
      last4 = coalesce(excluded.last4, public.payment_methods.last4),
      exp_month = coalesce(excluded.exp_month, public.payment_methods.exp_month),
      exp_year = coalesce(excluded.exp_year, public.payment_methods.exp_year),
      deleted_at = null
    returning id into v_pm_id;
  end if;

  insert into public.transaction_status_events (transaction_id, status, reason, provider_event_id, payload)
  values (v_tx.id, 'succeeded', 'webhook_confirmed', p_provider_event_id, p_payload)
  returning id into v_event_id;

  update public.transactions set
    current_status = 'succeeded',
    current_status_event_id = v_event_id,
    payment_method_id = coalesce(v_pm_id, payment_method_id),
    updated_at = now()
  where id = v_tx.id;

  update public.profiles
    set credits = credits + v_tx.units_total
    where id = v_tx.user_id
    returning credits into v_new_balance;

  insert into public.credit_ledger (user_id, delta, reason, transaction_id, balance_after)
  values (v_tx.user_id, v_tx.units_total, 'purchase', v_tx.id, v_new_balance);

  return jsonb_build_object(
    'status', 'applied',
    'transaction_id', v_tx.id,
    'event_id', v_event_id,
    'new_balance', v_new_balance
  );
end;
$$;

-- ========== RPC: apply_transaction_terminal ==========
-- For 'failed' | 'canceled'. No balance change. Idempotent.

create or replace function public.apply_transaction_terminal(
  p_provider public.payment_provider,
  p_provider_payment_id text,
  p_provider_event_id text,
  p_status public.tx_status,
  p_reason text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transactions%rowtype;
  v_event_id uuid;
begin
  if p_status not in ('failed', 'canceled', 'authorized') then
    raise exception 'invalid_terminal_status: %', p_status;
  end if;

  select * into v_tx from public.transactions
    where provider = p_provider and provider_payment_id = p_provider_payment_id
    for update;
  if not found then raise exception 'transaction_not_found'; end if;

  if p_provider_event_id is not null then
    perform 1 from public.transaction_status_events where provider_event_id = p_provider_event_id;
    if found then return jsonb_build_object('status', 'already_applied'); end if;
  end if;

  if v_tx.current_status in ('succeeded', 'refunded') then
    return jsonb_build_object('status', 'terminal_ignored');
  end if;

  insert into public.transaction_status_events (transaction_id, status, reason, provider_event_id, payload)
  values (v_tx.id, p_status, p_reason, p_provider_event_id, p_payload)
  returning id into v_event_id;

  update public.transactions set
    current_status = p_status,
    current_status_event_id = v_event_id,
    updated_at = now()
  where id = v_tx.id;

  return jsonb_build_object('status', 'applied', 'transaction_id', v_tx.id);
end;
$$;

-- ========== RPC: apply_symptom_check_usage ==========
-- Replaces the direct profiles.credits decrement in /api/symptom-check.
-- Atomic: fails if credits <= 0.

create or replace function public.apply_symptom_check_usage(
  p_user_id uuid,
  p_symptom_check_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  update public.profiles
    set credits = credits - 1
    where id = p_user_id and credits > 0
    returning credits into v_new_balance;
  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.credit_ledger (user_id, delta, reason, symptom_check_id, balance_after)
  values (p_user_id, -1, 'usage', p_symptom_check_id, v_new_balance);

  return jsonb_build_object('new_balance', v_new_balance);
end;
$$;

-- ========== RPC: apply_refund ==========
-- Called from the admin refund script. Full or partial refund of units.
-- Clamps profile.credits at 0 if the user already spent them.

create or replace function public.apply_refund(
  p_transaction_id uuid,
  p_provider_event_id text,
  p_amount_units integer default null,
  p_reason text default 'admin_refund',
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transactions%rowtype;
  v_event_id uuid;
  v_new_balance integer;
  v_refund_units integer;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'transaction_not_found'; end if;
  if v_tx.current_status <> 'succeeded' then
    raise exception 'non_refundable_status: %', v_tx.current_status;
  end if;

  v_refund_units := coalesce(p_amount_units, v_tx.units_total);
  if v_refund_units <= 0 or v_refund_units > v_tx.units_total then
    raise exception 'invalid_refund_amount';
  end if;

  if p_provider_event_id is not null then
    perform 1 from public.transaction_status_events where provider_event_id = p_provider_event_id;
    if found then return jsonb_build_object('status', 'already_applied'); end if;
  end if;

  insert into public.transaction_status_events (transaction_id, status, reason, provider_event_id, payload)
  values (v_tx.id, 'refunded', p_reason, p_provider_event_id, p_payload)
  returning id into v_event_id;

  update public.transactions set
    current_status = 'refunded',
    current_status_event_id = v_event_id,
    updated_at = now()
  where id = v_tx.id;

  update public.profiles
    set credits = greatest(0, credits - v_refund_units)
    where id = v_tx.user_id
    returning credits into v_new_balance;

  insert into public.credit_ledger (user_id, delta, reason, transaction_id, balance_after)
  values (v_tx.user_id, -v_refund_units, 'refund', v_tx.id, v_new_balance);

  return jsonb_build_object('status', 'applied', 'new_balance', v_new_balance);
end;
$$;

-- ========== RLS ==========
-- packages: public catalog (read). Everything else: service-role only.

alter table public.packages enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_status_events enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.payment_methods enable row level security;

drop policy if exists packages_read_all on public.packages;
create policy packages_read_all on public.packages for select using (true);

-- transactions/events/ledger/payment_methods: no policies means RLS denies
-- all access to anon/authenticated. service_role bypasses RLS automatically.
