-- Harden billing state transitions and keep package pricing canonical.
-- Dummy payments remain available; this only prevents inconsistent transitions.

update public.packages
set amount = unit_price * units
where amount <> unit_price * units;

alter table public.packages
  drop constraint if exists packages_amount_matches_units;

alter table public.packages
  add constraint packages_amount_matches_units
  check (amount = unit_price * units);

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
  v_tx public.transactions%rowtype;
begin
  select * into v_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'transaction_not_found';
  end if;

  if v_tx.current_status <> 'created' then
    raise exception 'invalid_transition:%->pending', v_tx.current_status;
  end if;

  if v_tx.provider_payment_id is not null then
    raise exception 'provider_payment_already_set';
  end if;

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

  if p_provider_event_id is not null then
    perform 1 from public.transaction_status_events where provider_event_id = p_provider_event_id;
    if found then
      return jsonb_build_object('status', 'already_applied', 'transaction_id', v_tx.id);
    end if;
  end if;

  if v_tx.current_status = 'succeeded' then
    return jsonb_build_object('status', 'already_succeeded', 'transaction_id', v_tx.id);
  end if;
  if v_tx.current_status not in ('pending', 'authorized') then
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

revoke execute on function public.mark_transaction_pending(uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_transaction_success(public.payment_provider, text, text, jsonb, text, text, text, smallint, smallint) from public, anon, authenticated;

grant execute on function public.mark_transaction_pending(uuid, text) to service_role;
grant execute on function public.apply_transaction_success(public.payment_provider, text, text, jsonb, text, text, text, smallint, smallint) to service_role;
