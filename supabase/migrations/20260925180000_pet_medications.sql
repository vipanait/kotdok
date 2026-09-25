-- Medication courses for the medical record (MR-06).
--
-- The pet form keeps its list «Принимает препараты»; this table is the
-- history behind it (spec §4). The list is always the names of the courses
-- going on now. A name added in the form starts a course today; a name
-- removed there ends it today, and the course stays in the history.
--
-- Two courses may share a name — the same drug twice, at different doses or
-- times — and are never merged by it (MR-06.3).

create table if not exists public.pet_medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  name text not null,
  -- «1 таблетка утром» — as the owner wrote it; never parsed into a schedule.
  dosage text,
  -- Null only for a course brought over from the form, whose start is unknown.
  started_on date,
  ended_on date,
  -- «Постоянно»: no end is coming. Different from an end nobody gave.
  ongoing boolean not null default false,
  -- `record`: added in the medical record; `form`: came from the pet form.
  source text not null default 'record',
  idempotency_key text,
  request_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.pet_medications drop constraint if exists pet_medications_name_check;
alter table public.pet_medications add constraint pet_medications_name_check
  check (char_length(btrim(name)) between 1 and 150 and char_length(coalesce(dosage, '')) <= 150);

alter table public.pet_medications drop constraint if exists pet_medications_range_check;
alter table public.pet_medications add constraint pet_medications_range_check
  check (ended_on is null or started_on is null or ended_on >= started_on);

alter table public.pet_medications drop constraint if exists pet_medications_ongoing_check;
alter table public.pet_medications add constraint pet_medications_ongoing_check
  check (not ongoing or ended_on is null);

alter table public.pet_medications drop constraint if exists pet_medications_source_check;
alter table public.pet_medications add constraint pet_medications_source_check
  check (source in ('record', 'form'));

-- One save of the form is one batch of courses sharing a key. Not unique: a
-- batch has several rows. Repeats are caught under the pet's lock.
create index if not exists pet_medications_idempotency
  on public.pet_medications (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists pet_medications_pet_idx on public.pet_medications (pet_id) where deleted_at is null;
create index if not exists pet_medications_user_idx on public.pet_medications (user_id);

alter table public.pet_medications enable row level security;

drop policy if exists "Users see own pet medications" on public.pet_medications;
create policy "Users see own pet medications" on public.pet_medications
  for select using (auth.uid() = user_id and public.current_account_is_active());

revoke insert, update, delete, truncate, references, trigger on public.pet_medications from anon, authenticated;

drop trigger if exists refuse_late_writes on public.pet_medications;
create trigger refuse_late_writes
  before insert or update on public.pet_medications
  for each row execute function public.refuse_write_for_inactive_account();

/**
 * Sets the form's list to the names of the courses going on after
 * `p_today`: not ended, or ending later. A course ended today — by
 * «Завершить курс» or by taking it off the form — is done. Each name once,
 * oldest course first.
 */
create or replace function public.sync_pet_medications(p_pet_id uuid, p_today date)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pets p
     set medications = coalesce((
       select array_agg(name order by first_seen)
         from (
           select btrim(m.name) as name, min(m.created_at) as first_seen
             from public.pet_medications m
            where m.pet_id = p_pet_id and m.deleted_at is null
              and (m.ended_on is null or m.ended_on > p_today)
            group by btrim(m.name)
         ) current
     ), '{}')
   where p.id = p_pet_id;
$$;

/**
 * The pet form saved its list: what it added starts a course on `p_today`,
 * what it removed ends the course(s) of that name on `p_today`.
 *
 * Compared with the list the form was showing, not with the courses: a
 * course that ran out yesterday is still on an unsaved form, and saving the
 * form for another field must not start it again. The same list twice
 * changes nothing (MR-06.1).
 */
create or replace function public.sync_form_medications(
  p_user_id uuid, p_pet_id uuid, p_names text[], p_today date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pet public.pets;
  v_name text;
  v_before text[];
  v_after text[];
begin
  v_pet := public.lock_own_pet(p_user_id, p_pet_id);

  select coalesce(array_agg(distinct lower(btrim(n))), '{}') into v_before
    from unnest(coalesce(v_pet.medications, '{}')) n where btrim(n) <> '';
  select coalesce(array_agg(distinct lower(btrim(n))), '{}') into v_after
    from unnest(coalesce(p_names, '{}')) n where btrim(n) <> '';

  -- Added in the form: a course from today, without details.
  foreach v_name in array (select coalesce(array_agg(n), '{}') from unnest(p_names) n where btrim(n) <> '')
  loop
    if not (lower(btrim(v_name)) = any (v_before)) then
      insert into public.pet_medications (user_id, pet_id, name, started_on, source)
      values (p_user_id, p_pet_id, btrim(v_name), p_today, 'form');
      v_before := v_before || lower(btrim(v_name));
    end if;
  end loop;

  -- Removed in the form: the courses of that name end today.
  update public.pet_medications m
     set ended_on = greatest(p_today, coalesce(m.started_on, p_today)),
         ongoing = false,
         updated_at = now()
   where m.pet_id = p_pet_id and m.deleted_at is null
     and (m.ended_on is null or m.ended_on >= p_today)
     and not (lower(btrim(m.name)) = any (v_after));

  perform public.sync_pet_medications(p_pet_id, p_today);
end;
$$;

/** New courses from the medical record: all of them or none, once per key. */
create or replace function public.create_pet_medications(
  p_user_id uuid, p_pet_id uuid, p_items jsonb, p_today date, p_key text
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := md5(p_items::text);
  v_existing text;
  v_ids uuid[] := '{}';
  v_item jsonb;
  v_id uuid;
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  if p_key is not null then
    select request_hash into v_existing from public.pet_medications
     where user_id = p_user_id and idempotency_key = p_key limit 1;
    if found then
      if v_existing is distinct from v_hash then
        raise exception 'idempotency key reused with different data' using errcode = 'unique_violation';
      end if;
      select coalesce(array_agg(id order by created_at, id), '{}') into v_ids
        from public.pet_medications
       where user_id = p_user_id and idempotency_key = p_key;
      return v_ids;
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.pet_medications (
      user_id, pet_id, name, dosage, started_on, ended_on, ongoing, source, idempotency_key, request_hash
    )
    values (
      p_user_id, p_pet_id,
      btrim(v_item->>'name'),
      nullif(btrim(v_item->>'dosage'), ''),
      nullif(v_item->>'started_on', '')::date,
      nullif(v_item->>'ended_on', '')::date,
      coalesce((v_item->>'ongoing')::boolean, false),
      'record',
      p_key,
      v_hash
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  perform public.sync_pet_medications(p_pet_id, p_today);
  return v_ids;
end;
$$;

/** Corrects a course, or ends it («Завершить курс» sends today as the end). */
create or replace function public.change_pet_medication(
  p_user_id uuid, p_pet_id uuid, p_medication_id uuid, p_changes jsonb, p_today date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  update public.pet_medications m
     set name = case when p_changes ? 'name' then btrim(p_changes->>'name') else m.name end,
         dosage = case when p_changes ? 'dosage' then nullif(btrim(p_changes->>'dosage'), '') else m.dosage end,
         started_on = case when p_changes ? 'started_on' then nullif(p_changes->>'started_on', '')::date else m.started_on end,
         ended_on = case when p_changes ? 'ended_on' then nullif(p_changes->>'ended_on', '')::date else m.ended_on end,
         ongoing = case when p_changes ? 'ongoing' then coalesce((p_changes->>'ongoing')::boolean, false) else m.ongoing end,
         -- A course the owner has edited is theirs, even if the form started it.
         source = 'record',
         updated_at = now()
   where m.id = p_medication_id and m.pet_id = p_pet_id and m.user_id = p_user_id and m.deleted_at is null;
  if not found then
    raise exception 'medication not found' using errcode = 'no_data_found';
  end if;

  perform public.sync_pet_medications(p_pet_id, p_today);
end;
$$;

create or replace function public.delete_pet_medication(
  p_user_id uuid, p_pet_id uuid, p_medication_id uuid, p_today date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  update public.pet_medications
     set deleted_at = now()
   where id = p_medication_id and pet_id = p_pet_id and user_id = p_user_id and deleted_at is null;
  if not found then
    raise exception 'medication not found' using errcode = 'no_data_found';
  end if;

  perform public.sync_pet_medications(p_pet_id, p_today);
end;
$$;

/**
 * Brings the forms' existing lists over as current courses with an unknown
 * start, once: a pet that already has a course of that name is left alone,
 * so running it again adds nothing (MR-06.1). No date is made up.
 */
create or replace function public.backfill_pet_medications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.pet_medications (user_id, pet_id, name, source)
  select p.user_id, p.id, btrim(n.name), 'form'
    from public.pets p
   cross join lateral (select distinct on (lower(btrim(x))) x as name from unnest(p.medications) x where btrim(x) <> '') n
   where p.deleted_at is null
     and not exists (
       select 1 from public.pet_medications m
        where m.pet_id = p.id and lower(btrim(m.name)) = lower(btrim(n.name))
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select public.backfill_pet_medications();

revoke all on function public.sync_pet_medications(uuid, date) from public, anon, authenticated;
revoke all on function public.sync_form_medications(uuid, uuid, text[], date) from public, anon, authenticated;
revoke all on function public.create_pet_medications(uuid, uuid, jsonb, date, text) from public, anon, authenticated;
revoke all on function public.change_pet_medication(uuid, uuid, uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.delete_pet_medication(uuid, uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.backfill_pet_medications() from public, anon, authenticated;

grant execute on function public.sync_form_medications(uuid, uuid, text[], date) to service_role;
grant execute on function public.create_pet_medications(uuid, uuid, jsonb, date, text) to service_role;
grant execute on function public.change_pet_medication(uuid, uuid, uuid, jsonb, date) to service_role;
grant execute on function public.delete_pet_medication(uuid, uuid, uuid, date) to service_role;
