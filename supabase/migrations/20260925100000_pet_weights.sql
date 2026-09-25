-- Weight history for the medical record (MR-02).
--
-- The pet form keeps its single `pets.weight_kg`; this table is the history
-- behind it. The two never disagree: every write here ends by setting
-- `pets.weight_kg` to the latest measurement (docs/design/medical-record-spec.md, §4).
--
-- Writes go only through the functions below, called by the server with the
-- service role. They lock the pet row first, so two saves for the same pet run
-- one after the other: two taps on «Сохранить» for one day give one row.

create table if not exists public.pet_weights (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  -- Account deletion removes pets; the history goes with them.
  pet_id uuid not null references public.pets(id) on delete cascade,

  -- A calendar day, not a moment: the owner weighed the cat on the 12th,
  -- wherever they were. Null only for the value the form held before the
  -- record existed — its date is unknown, and inventing one would put a
  -- made-up fact into a medical history.
  measured_on date,

  -- The same type as `pets.weight_kg`, so copying a value across never rounds it.
  weight_kg double precision not null,

  -- `record`: added in the medical record. `form`: came from the pet form —
  -- a weight changed there, or the old undated value.
  source text not null default 'record',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.pet_weights drop constraint if exists pet_weights_weight_check;
alter table public.pet_weights
  add constraint pet_weights_weight_check check (weight_kg > 0 and weight_kg <= 200);

alter table public.pet_weights drop constraint if exists pet_weights_source_check;
alter table public.pet_weights
  add constraint pet_weights_source_check check (source in ('record', 'form'));

-- Only the form's old value may lack a date.
alter table public.pet_weights drop constraint if exists pet_weights_dated_check;
alter table public.pet_weights
  add constraint pet_weights_dated_check check (measured_on is not null or source = 'form');

-- One live measurement per pet and day; a second save that day updates it.
create unique index if not exists pet_weights_one_per_day
  on public.pet_weights (pet_id, measured_on)
  where deleted_at is null and measured_on is not null;

-- At most one undated value per pet.
create unique index if not exists pet_weights_one_undated
  on public.pet_weights (pet_id)
  where deleted_at is null and measured_on is null;

create index if not exists pet_weights_user_idx on public.pet_weights (user_id);

alter table public.pet_weights enable row level security;

drop policy if exists "Users see own pet weights" on public.pet_weights;
create policy "Users see own pet weights" on public.pet_weights
  for select using (auth.uid() = user_id and public.current_account_is_active());

revoke insert, update, delete, truncate, references, trigger
  on public.pet_weights from anon, authenticated;

drop trigger if exists refuse_late_writes on public.pet_weights;
create trigger refuse_late_writes
  before insert or update on public.pet_weights
  for each row execute function public.refuse_write_for_inactive_account();

/**
 * Sets the form's weight to the latest live measurement: the newest dated one,
 * or the undated one when there is nothing dated, or nothing at all.
 *
 * Nothing at all is `null`, not zero: a pet whose every measurement was deleted
 * has an unknown weight.
 */
create or replace function public.sync_pet_weight(p_pet_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pets p
     set weight_kg = (
       select w.weight_kg
         from public.pet_weights w
        where w.pet_id = p_pet_id and w.deleted_at is null
        order by w.measured_on desc nulls last, w.updated_at desc
        limit 1
     )
   where p.id = p_pet_id;
$$;

/**
 * Locks the caller's live pet, or says there is none.
 *
 * Someone else's pet and a deleted one are the same answer, as everywhere else.
 */
create or replace function public.lock_own_pet(p_user_id uuid, p_pet_id uuid)
returns public.pets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pet public.pets;
begin
  select * into v_pet
    from public.pets
   where id = p_pet_id and user_id = p_user_id and deleted_at is null
     for update;

  if not found then
    raise exception 'pet not found' using errcode = 'no_data_found';
  end if;

  return v_pet;
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
 * gave earlier stays in the history instead of vanishing.
 */
create or replace function public.record_pet_weight(
  p_user_id uuid,
  p_pet_id uuid,
  p_measured_on date,
  p_weight_kg double precision,
  p_source text default 'record'
)
returns public.pet_weights
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pet public.pets;
  v_row public.pet_weights;
begin
  v_pet := public.lock_own_pet(p_user_id, p_pet_id);

  if p_source = 'form' and v_pet.weight_kg is not distinct from p_weight_kg then
    return null;
  end if;

  if v_pet.weight_kg is not null
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

  perform public.sync_pet_weight(p_pet_id);
  return v_row;
end;
$$;

/**
 * Corrects one measurement. A null argument keeps that field as it is.
 *
 * Moving it onto a day that already has a measurement is refused with
 * unique_violation, not merged: which of the two values is right is the
 * owner's call.
 */
create or replace function public.change_pet_weight(
  p_user_id uuid,
  p_pet_id uuid,
  p_weight_id uuid,
  p_measured_on date,
  p_weight_kg double precision
)
returns public.pet_weights
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pet_weights;
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  update public.pet_weights
     set measured_on = coalesce(p_measured_on, measured_on),
         weight_kg = coalesce(p_weight_kg, weight_kg),
         updated_at = now()
   where id = p_weight_id and pet_id = p_pet_id and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'weight not found' using errcode = 'no_data_found';
  end if;

  perform public.sync_pet_weight(p_pet_id);
  return v_row;
end;
$$;

/** Removes one measurement; the form falls back to the one before it. */
create or replace function public.delete_pet_weight(p_user_id uuid, p_pet_id uuid, p_weight_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  update public.pet_weights
     set deleted_at = now()
   where id = p_weight_id and pet_id = p_pet_id and deleted_at is null;

  if not found then
    raise exception 'weight not found' using errcode = 'no_data_found';
  end if;

  perform public.sync_pet_weight(p_pet_id);
end;
$$;

revoke all on function public.sync_pet_weight(uuid) from public, anon, authenticated;
revoke all on function public.lock_own_pet(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_pet_weight(uuid, uuid, date, double precision, text) from public, anon, authenticated;
revoke all on function public.change_pet_weight(uuid, uuid, uuid, date, double precision) from public, anon, authenticated;
revoke all on function public.delete_pet_weight(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.record_pet_weight(uuid, uuid, date, double precision, text) to service_role;
grant execute on function public.change_pet_weight(uuid, uuid, uuid, date, double precision) to service_role;
grant execute on function public.delete_pet_weight(uuid, uuid, uuid) to service_role;
