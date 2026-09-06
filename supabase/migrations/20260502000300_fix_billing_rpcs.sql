-- Fix billing RPCs for databases where 20260502_rename_amount_columns.sql was
-- already applied, and lock service-only functions down to service_role.

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
    units_total, unit_price, amount, currency,
    metadata, payment_method_id
  ) values (
    p_user_id, p_provider, p_package_id,
    v_pkg.units, v_pkg.unit_price, v_pkg.unit_price * v_pkg.units, v_pkg.currency,
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
  v_ledger_id uuid;
begin
  update public.profiles
    set credits = credits - 1
    where id = p_user_id and credits > 0
    returning credits into v_new_balance;
  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.credit_ledger (user_id, delta, reason, symptom_check_id, balance_after)
  values (p_user_id, -1, 'usage', p_symptom_check_id, v_new_balance)
  returning id into v_ledger_id;

  return jsonb_build_object('new_balance', v_new_balance, 'ledger_id', v_ledger_id);
end;
$$;

create or replace function public.refund_symptom_check_usage(
  p_user_id uuid,
  p_usage_ledger_id uuid,
  p_reason text default 'usage_refund'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.credit_ledger%rowtype;
  v_new_balance integer;
begin
  select * into v_usage
  from public.credit_ledger
  where id = p_usage_ledger_id
    and user_id = p_user_id
    and delta = -1
    and reason = 'usage'
  for update;
  if not found then
    raise exception 'usage_ledger_not_found';
  end if;

  update public.profiles
    set credits = credits + 1
    where id = p_user_id
    returning credits into v_new_balance;

  insert into public.credit_ledger (user_id, delta, reason, symptom_check_id, balance_after)
  values (p_user_id, 1, 'refund', v_usage.symptom_check_id, v_new_balance);

  return jsonb_build_object('new_balance', v_new_balance, 'reason', p_reason);
end;
$$;

revoke execute on function public.create_transaction(uuid, public.payment_provider, uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.mark_transaction_pending(uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_transaction_success(public.payment_provider, text, text, jsonb, text, text, text, smallint, smallint) from public, anon, authenticated;
revoke execute on function public.apply_transaction_terminal(public.payment_provider, text, text, public.tx_status, text, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_symptom_check_usage(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.apply_refund(uuid, text, integer, text, jsonb) from public, anon, authenticated;
revoke execute on function public.refund_symptom_check_usage(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.create_transaction(uuid, public.payment_provider, uuid, jsonb, uuid) to service_role;
grant execute on function public.mark_transaction_pending(uuid, text) to service_role;
grant execute on function public.apply_transaction_success(public.payment_provider, text, text, jsonb, text, text, text, smallint, smallint) to service_role;
grant execute on function public.apply_transaction_terminal(public.payment_provider, text, text, public.tx_status, text, jsonb) to service_role;
grant execute on function public.apply_symptom_check_usage(uuid, uuid) to service_role;
grant execute on function public.apply_refund(uuid, text, integer, text, jsonb) to service_role;
grant execute on function public.refund_symptom_check_usage(uuid, uuid, text) to service_role;
