-- Vet visits in the medical record (MR-07).
--
-- A visit is a record of kind «visit»: done («Был») or planned. A done visit
-- carries a reason, a diagnosis and prescriptions — one item each, with how
-- to give it. A prescription with «Добавить в лекарства» starts a course in
-- the same transaction, linked back to it. The course is then the owner's:
-- correcting or deleting the visit never changes or removes it, only the
-- link goes (MR-07.4).
--
-- A planned visit has no items: it is one due date on its own.

alter table public.pet_health_events drop constraint if exists pet_health_events_kind_check;
alter table public.pet_health_events add constraint pet_health_events_kind_check
  check (kind in ('vaccination', 'parasite', 'visit'));

alter table public.pet_health_events add column if not exists visit_kind text;
alter table public.pet_health_events add column if not exists reason text;
alter table public.pet_health_events add column if not exists diagnosis text;
alter table public.pet_health_events add column if not exists check_id uuid references public.symptom_checks(id) on delete set null;

alter table public.pet_health_events drop constraint if exists pet_health_events_visit_check;
alter table public.pet_health_events add constraint pet_health_events_visit_check
  check (
    (kind = 'visit' and visit_kind in ('checkup', 'illness', 'surgery', 'tests', 'other'))
    or (kind <> 'visit' and visit_kind is null and reason is null and diagnosis is null and check_id is null)
  );

alter table public.pet_health_events drop constraint if exists pet_health_events_visit_text_check;
alter table public.pet_health_events add constraint pet_health_events_visit_text_check
  check (char_length(coalesce(reason, '')) <= 500 and char_length(coalesce(diagnosis, '')) <= 500);

-- A plan has not happened: nothing was diagnosed yet.
alter table public.pet_health_events drop constraint if exists pet_health_events_planned_diagnosis_check;
alter table public.pet_health_events add constraint pet_health_events_planned_diagnosis_check
  check (status = 'done' or diagnosis is null);

-- «Как принимать» for a prescription.
alter table public.pet_health_items add column if not exists instructions text;
alter table public.pet_health_items drop constraint if exists pet_health_items_instructions_check;
alter table public.pet_health_items add constraint pet_health_items_instructions_check
  check (char_length(coalesce(instructions, '')) <= 150);

-- The prescription a course came from. Cleared, not cascaded, when the visit goes.
alter table public.pet_medications
  add column if not exists visit_item_id uuid references public.pet_health_items(id) on delete set null;
create index if not exists pet_medications_visit_item_idx on public.pet_medications (visit_item_id) where visit_item_id is not null;

/** Items now carry «как принимать» too. */
create or replace function public.insert_health_items(
  p_user_id uuid, p_pet_id uuid, p_event_id uuid, p_items jsonb, p_source_ids uuid[] default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := '{}';
  v_item jsonb;
  v_index int := 0;
  v_id uuid;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.pet_health_items (
      event_id, user_id, pet_id, position, name, targets, source_item_id, product_id, interval_value, interval_unit, instructions
    )
    select
      p_event_id, p_user_id, p_pet_id, v_index,
      nullif(btrim(v_item->>'name'), ''),
      coalesce(array(select jsonb_array_elements_text(v_item->'targets')), '{}'),
      case when p_source_ids is null then null else p_source_ids[v_index + 1] end,
      nullif(v_item->>'product_id', '')::uuid,
      coalesce((v_item->>'interval_value')::integer, p.interval_value),
      coalesce(v_item->>'interval_unit', p.interval_unit),
      nullif(btrim(v_item->>'instructions'), '')
    from (select 1) one
    left join public.health_products p on p.id = nullif(v_item->>'product_id', '')::uuid
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_index := v_index + 1;
  end loop;
  return v_ids;
end;
$$;

/**
 * A course from a prescription: starts on the visit's day, «как принимать»
 * as its dosage. Once per prescription — asking twice adds nothing.
 */
create or replace function public.course_from_prescription(p_user_id uuid, p_pet_id uuid, p_item_id uuid, p_today date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  select id into v_existing from public.pet_medications
   where visit_item_id = p_item_id and deleted_at is null limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.pet_medications (user_id, pet_id, name, dosage, started_on, source, visit_item_id)
  select p_user_id, p_pet_id, i.name, i.instructions, e.event_date, 'record', i.id
    from public.pet_health_items i
    join public.pet_health_events e on e.id = i.event_id
   where i.id = p_item_id and i.pet_id = p_pet_id and i.user_id = p_user_id
     and i.deleted_at is null and e.deleted_at is null and e.kind = 'visit' and e.status = 'done'
     and i.name is not null
  returning id into v_id;
  if v_id is null then
    raise exception 'prescription not found' using errcode = 'no_data_found';
  end if;

  perform public.sync_pet_medications(p_pet_id, p_today);
  return v_id;
end;
$$;

/**
 * A new visit with its prescriptions, and the courses those marked «Добавить в
 * лекарства» start: all or nothing, once per key. `p_items` is
 * `[{name, instructions, add_to_medications}]`; a plan has none.
 */
create or replace function public.create_visit(
  p_user_id uuid,
  p_pet_id uuid,
  p_status text,
  p_date date,
  p_clinic text,
  p_notes text,
  p_visit jsonb,
  p_items jsonb,
  p_today date,
  p_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid;
  v_ids uuid[];
  v_index int := 0;
  v_item jsonb;
  v_hash text := md5(jsonb_build_array('visit', p_status, p_date, p_clinic, p_notes, p_visit, p_items)::text);
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  v_event := public.health_event_by_key(p_user_id, p_key, v_hash);
  if v_event is not null then
    return v_event;
  end if;

  insert into public.pet_health_events (
    user_id, pet_id, kind, status, event_date, clinic, notes, visit_kind, reason, diagnosis, check_id, idempotency_key, request_hash
  )
  values (
    p_user_id, p_pet_id, 'visit', p_status, p_date,
    nullif(btrim(p_clinic), ''), nullif(btrim(p_notes), ''),
    p_visit->>'visit_kind',
    nullif(btrim(p_visit->>'reason'), ''),
    case when p_status = 'done' then nullif(btrim(p_visit->>'diagnosis'), '') else null end,
    nullif(p_visit->>'check_id', '')::uuid,
    p_key, v_hash
  )
  returning id into v_event;

  if p_status = 'done' and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    v_ids := public.insert_health_items(p_user_id, p_pet_id, v_event, p_items);
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      if coalesce((v_item->>'add_to_medications')::boolean, false) then
        perform public.course_from_prescription(p_user_id, p_pet_id, v_ids[v_index + 1], p_today);
      end if;
      v_index := v_index + 1;
    end loop;
  end if;

  return v_event;
end;
$$;

/**
 * Corrects a visit, or marks a planned one as having happened («Был»): the
 * day, clinic, note, visit fields and — on a done visit — the prescriptions.
 * `id` keeps a prescription, no `id` adds one (with its course if asked); one
 * left out is removed, and a course it started keeps going without the link.
 * A course is never rewritten from here: the owner may have changed it.
 */
create or replace function public.update_visit(
  p_user_id uuid,
  p_pet_id uuid,
  p_event_id uuid,
  p_changes jsonb,
  p_items jsonb,
  p_today date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.pet_health_events;
  v_status text;
  v_item jsonb;
  v_keep uuid[] := '{}';
  v_position int := 0;
  v_id uuid;
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  select * into v_event from public.pet_health_events
   where id = p_event_id and pet_id = p_pet_id and user_id = p_user_id and deleted_at is null and kind = 'visit';
  if not found then
    raise exception 'visit not found' using errcode = 'no_data_found';
  end if;

  v_status := coalesce(p_changes->>'status', v_event.status);

  update public.pet_health_events
     set status = v_status,
         event_date = coalesce((p_changes->>'date')::date, event_date),
         clinic = case when p_changes ? 'clinic' then nullif(btrim(p_changes->>'clinic'), '') else clinic end,
         notes = case when p_changes ? 'notes' then nullif(btrim(p_changes->>'notes'), '') else notes end,
         visit_kind = coalesce(p_changes->>'visit_kind', visit_kind),
         reason = case when p_changes ? 'reason' then nullif(btrim(p_changes->>'reason'), '') else reason end,
         diagnosis = case
           when v_status <> 'done' then null
           when p_changes ? 'diagnosis' then nullif(btrim(p_changes->>'diagnosis'), '')
           else diagnosis
         end,
         check_id = case when p_changes ? 'check_id' then nullif(p_changes->>'check_id', '')::uuid else check_id end,
         updated_at = now()
   where id = p_event_id;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      if v_item ? 'id' and v_item->>'id' is not null then
        update public.pet_health_items
           set name = nullif(btrim(v_item->>'name'), ''),
               instructions = nullif(btrim(v_item->>'instructions'), ''),
               position = v_position
         where id = (v_item->>'id')::uuid and event_id = p_event_id and deleted_at is null
        returning id into v_id;
        if v_id is null then
          raise exception 'item not found' using errcode = 'no_data_found';
        end if;
      else
        v_id := (public.insert_health_items(p_user_id, p_pet_id, p_event_id, jsonb_build_array(v_item)))[1];
        update public.pet_health_items set position = v_position where id = v_id;
        if coalesce((v_item->>'add_to_medications')::boolean, false) and v_status = 'done' then
          perform public.course_from_prescription(p_user_id, p_pet_id, v_id, p_today);
        end if;
      end if;
      v_keep := v_keep || v_id;
      v_position := v_position + 1;
      v_id := null;
    end loop;

    update public.pet_medications
       set visit_item_id = null, updated_at = now()
     where visit_item_id in (
       select id from public.pet_health_items
        where event_id = p_event_id and deleted_at is null and not (id = any (v_keep))
     );
    update public.pet_health_items
       set deleted_at = now()
     where event_id = p_event_id and deleted_at is null and not (id = any (v_keep));
  end if;

  return p_event_id;
end;
$$;

/** Deleting any record now also lets go of courses its prescriptions started. */
create or replace function public.delete_health_event(p_user_id uuid, p_pet_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  update public.pet_health_events
     set deleted_at = now()
   where id = p_event_id and pet_id = p_pet_id and user_id = p_user_id and deleted_at is null;
  if not found then
    raise exception 'event not found' using errcode = 'no_data_found';
  end if;

  update public.pet_medications
     set visit_item_id = null, updated_at = now()
   where visit_item_id in (select id from public.pet_health_items where event_id = p_event_id);

  update public.pet_health_items set deleted_at = now() where event_id = p_event_id and deleted_at is null;
  perform public.sync_pet_vaccinated(p_pet_id);
end;
$$;

revoke all on function public.insert_health_items(uuid, uuid, uuid, jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.course_from_prescription(uuid, uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.create_visit(uuid, uuid, text, date, text, text, jsonb, jsonb, date, text) from public, anon, authenticated;
revoke all on function public.update_visit(uuid, uuid, uuid, jsonb, jsonb, date) from public, anon, authenticated;
revoke all on function public.delete_health_event(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.course_from_prescription(uuid, uuid, uuid, date) to service_role;
grant execute on function public.create_visit(uuid, uuid, text, date, text, text, jsonb, jsonb, date, text) to service_role;
grant execute on function public.update_visit(uuid, uuid, uuid, jsonb, jsonb, date) to service_role;
grant execute on function public.delete_health_event(uuid, uuid, uuid) to service_role;
