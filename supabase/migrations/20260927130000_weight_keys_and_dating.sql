-- Weights: an Idempotency-Key, and dating the form's weight (MW-09).
--
-- 1. A weighing was saved without a key (MW-02): a retry sent after midnight
--    — the answer lost, the form's day recomputed — could add a second
--    measurement. POST and PATCH now take an optional key, as the other
--    records do: the same key with the same data answers with the
--    measurement it made, with other data it is unique_violation (409).
--    Keys live in a table of their own, not on the measurement: a day's row
--    is overwritten by the next save for that day, and a late retry must not
--    find the newer save's key there and write its old value over it.
--    Without a key nothing changes (older apps, the pet form).
--
-- 2. «Уточнить» on the form's weight when there is no history yet: the owner
--    gives that value a day. The first dated row used to keep the form's old
--    value as an undated row beside it — two rows for one weighing. A first
--    measurement with the very value the form holds is now that value, dated:
--    one row. A first measurement with another value still keeps the old one
--    undated, as before. The form's weight follows the history as always.

create table if not exists public.pet_weight_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  -- What the keyed request asked for; the same key with other data is a conflict.
  request_hash text not null,
  pet_id uuid not null references public.pets(id) on delete cascade,
  weight_id uuid not null references public.pet_weights(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index if not exists pet_weight_requests_pet_idx on public.pet_weight_requests (pet_id);
create index if not exists pet_weight_requests_weight_idx on public.pet_weight_requests (weight_id);

-- Written and read only by the functions below, with the service role.
alter table public.pet_weight_requests enable row level security;
revoke all on public.pet_weight_requests from anon, authenticated;

drop trigger if exists refuse_late_writes on public.pet_weight_requests;
create trigger refuse_late_writes
  before insert or update on public.pet_weight_requests
  for each row execute function public.refuse_write_for_inactive_account();

/**
 * The measurement an earlier request with this key made or corrected, if
 * any. The same key with other data is refused with unique_violation; a
 * measurement deleted since is no_data_found.
 */
create or replace function public.pet_weight_by_key(p_user_id uuid, p_key text, p_hash text)
returns public.pet_weights
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.pet_weight_requests;
  v_row public.pet_weights;
begin
  if p_key is null then
    return null;
  end if;
  select * into v_request from public.pet_weight_requests where user_id = p_user_id and idempotency_key = p_key;
  if not found then
    return null;
  end if;
  if v_request.request_hash is distinct from p_hash then
    raise exception 'idempotency key reused with different data' using errcode = 'unique_violation';
  end if;
  select * into v_row from public.pet_weights where id = v_request.weight_id and deleted_at is null;
  if not found then
    raise exception 'weight not found' using errcode = 'no_data_found';
  end if;
  return v_row;
end;
$$;

/**
 * Records a weight for a day: a new row, or the day's existing row updated.
 *
 * `p_source = 'form'` is the pet form saving a weight. It records nothing when
 * the form's weight did not change, so saving the form for another field does
 * not add a measurement.
 *
 * Before the first row, the form's old value is kept as an undated row: the
 * first dated measurement becomes the current weight, and the value the owner
 * gave earlier stays in the history instead of vanishing — unless the new
 * measurement is that very value: then it is the form's weight given its
 * day («Уточнить»), and one row carries it.
 *
 * `p_key`: see pet_weight_by_key.
 */
drop function if exists public.record_pet_weight(uuid, uuid, date, double precision, text);
create or replace function public.record_pet_weight(
  p_user_id uuid,
  p_pet_id uuid,
  p_measured_on date,
  p_weight_kg double precision,
  p_source text default 'record',
  p_key text default null
)
returns public.pet_weights
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pet public.pets;
  v_row public.pet_weights;
  v_hash text := md5(jsonb_build_array('record', p_pet_id, p_measured_on, p_weight_kg, p_source)::text);
begin
  v_pet := public.lock_own_pet(p_user_id, p_pet_id);

  v_row := public.pet_weight_by_key(p_user_id, p_key, v_hash);
  if v_row.id is not null then
    return v_row;
  end if;

  if p_source = 'form' and v_pet.weight_kg is not distinct from p_weight_kg then
    return null;
  end if;

  -- Only a value a measurement could hold: the forms have accepted 0, and a
  -- row the table refuses would fail every later save for this pet.
  if v_pet.weight_kg > 0 and v_pet.weight_kg <= 200
     and v_pet.weight_kg is distinct from p_weight_kg
     and not exists (
       select 1 from public.pet_weights
        where pet_id = p_pet_id and deleted_at is null
     ) then
    insert into public.pet_weights (user_id, pet_id, measured_on, weight_kg, source)
    values (p_user_id, p_pet_id, null, v_pet.weight_kg, 'form');
  end if;

  insert into public.pet_weights (user_id, pet_id, measured_on, weight_kg, source)
  values (p_user_id, p_pet_id, p_measured_on, p_weight_kg, p_source)
  on conflict (pet_id, measured_on) where deleted_at is null and measured_on is not null
  do update set weight_kg = excluded.weight_kg,
                source = excluded.source,
                updated_at = now()
  returning * into v_row;

  if p_key is not null then
    insert into public.pet_weight_requests (user_id, idempotency_key, request_hash, pet_id, weight_id)
    values (p_user_id, p_key, v_hash, p_pet_id, v_row.id);
  end if;

  perform public.sync_pet_weight(p_pet_id);
  return v_row;
end;
$$;

/**
 * Corrects one measurement. A null argument keeps that field as it is.
 *
 * Moving it onto a day that already has a measurement is refused with
 * unique_violation, not merged: which of the two values is right is the
 * owner's call. `p_key`: see pet_weight_by_key.
 */
drop function if exists public.change_pet_weight(uuid, uuid, uuid, date, double precision);
create or replace function public.change_pet_weight(
  p_user_id uuid,
  p_pet_id uuid,
  p_weight_id uuid,
  p_measured_on date,
  p_weight_kg double precision,
  p_key text default null
)
returns public.pet_weights
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pet_weights;
  v_hash text := md5(jsonb_build_array('change', p_pet_id, p_weight_id, p_measured_on, p_weight_kg)::text);
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  v_row := public.pet_weight_by_key(p_user_id, p_key, v_hash);
  if v_row.id is not null then
    return v_row;
  end if;

  update public.pet_weights
     set measured_on = coalesce(p_measured_on, measured_on),
         weight_kg = coalesce(p_weight_kg, weight_kg),
         updated_at = now()
   where id = p_weight_id and pet_id = p_pet_id and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'weight not found' using errcode = 'no_data_found';
  end if;

  if p_key is not null then
    insert into public.pet_weight_requests (user_id, idempotency_key, request_hash, pet_id, weight_id)
    values (p_user_id, p_key, v_hash, p_pet_id, v_row.id);
  end if;

  perform public.sync_pet_weight(p_pet_id);
  return v_row;
end;
$$;

revoke all on function public.pet_weight_by_key(uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_pet_weight(uuid, uuid, date, double precision, text, text) from public, anon, authenticated;
revoke all on function public.change_pet_weight(uuid, uuid, uuid, date, double precision, text) from public, anon, authenticated;

grant execute on function public.record_pet_weight(uuid, uuid, date, double precision, text, text) to service_role;
grant execute on function public.change_pet_weight(uuid, uuid, uuid, date, double precision, text) to service_role;
