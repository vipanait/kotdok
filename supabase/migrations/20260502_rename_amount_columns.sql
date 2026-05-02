-- Rename monetary columns: drop _cents suffix (irrelevant for multi-currency),
-- remove unit_price_cents (always derivable as ROUND(amount / units)).

-- packages
alter table public.packages rename column unit_price_cents to unit_price;
alter table public.packages rename column price_cents to amount;
-- fix amounts so amount = unit_price * units
update public.packages set amount = unit_price * units;

-- transactions (price snapshot)
alter table public.transactions rename column unit_price_cents to unit_price;
alter table public.transactions rename column amount_cents to amount;

-- Re-create create_transaction with updated column references.
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
    units_total, amount, currency,
    metadata, payment_method_id
  ) values (
    p_user_id, p_provider, p_package_id,
    v_pkg.units, v_pkg.unit_price * v_pkg.units, v_pkg.currency,
    p_metadata, p_payment_method_id
  )
  returning id into v_tx_id;

  insert into public.transaction_status_events (transaction_id, status, reason)
  values (v_tx_id, 'created', 'user_initiated')
  returning id into v_event_id;

  update public.transactions set current_status_event_id = v_event_id where id = v_tx_id;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'amount', v_pkg.unit_price * v_pkg.units,
    'currency', v_pkg.currency,
    'package_name', v_pkg.name
  );
end;
$$;
