-- History stays history inside the write itself (MW-09).
--
-- The owner's rule of 26 September 2026: a vaccination or treatment that was
-- done, a visit that happened and a finished course are read and deleted,
-- never changed. The server checked it by reading the record first and
-- writing after (`refuseDoneChange`, `courseOverEverywhere`): a «Сделано»,
-- «Состоялся» or «Завершить курс» from another device landing between that
-- read and the write let the change through onto the done record.
--
-- Now the functions that write refuse it themselves, under the pet's lock
-- that every write of a pet's records takes: whatever finished the record
-- first has committed by the time the check runs, and the refusal and the
-- write are one statement's decision. The services keep their own check for
-- a clear answer before any work; this one is the last word.
--
-- The refusal is SQLSTATE LP409 ("record done"), which the services answer
-- as 409 record_done. Older servers, which do not know the code, answer it
-- 500 — only in that race, which they let through before.

/**
 * Corrects a plan: its day, clinic and note, and its items. Only a plan: a
 * done record is refused (LP409), and so is an item of it that «Сделано»
 * has meanwhile moved into a done record of its own.
 */
create or replace function public.update_health_event(
  p_user_id uuid,
  p_pet_id uuid,
  p_event_id uuid,
  p_date date,
  p_clinic text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_keep uuid[] := '{}';
  v_position int := 0;
  v_id uuid;
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  update public.pet_health_events
     set event_date = coalesce(p_date, event_date),
         clinic = case when p_clinic is null then clinic else nullif(btrim(p_clinic), '') end,
         notes = case when p_notes is null then notes else nullif(btrim(p_notes), '') end,
         updated_at = now()
   where id = p_event_id and pet_id = p_pet_id and user_id = p_user_id and deleted_at is null
     and status = 'planned';
  if not found then
    if exists (
      select 1 from public.pet_health_events
       where id = p_event_id and pet_id = p_pet_id and user_id = p_user_id and deleted_at is null
    ) then
      raise exception 'record done' using errcode = 'LP409';
    end if;
    raise exception 'event not found' using errcode = 'no_data_found';
  end if;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      if v_item ? 'id' and v_item->>'id' is not null then
        -- The interval is the snapshot of the product the item was picked
        -- from: it changes only when the product does.
        update public.pet_health_items i
           set name = nullif(btrim(v_item->>'name'), ''),
               targets = coalesce(array(select jsonb_array_elements_text(v_item->'targets')), '{}'),
               interval_value = case
                 when i.product_id is not distinct from nullif(v_item->>'product_id', '')::uuid then i.interval_value
                 else (select p.interval_value from public.health_products p where p.id = nullif(v_item->>'product_id', '')::uuid)
               end,
               interval_unit = case
                 when i.product_id is not distinct from nullif(v_item->>'product_id', '')::uuid then i.interval_unit
                 else (select p.interval_unit from public.health_products p where p.id = nullif(v_item->>'product_id', '')::uuid)
               end,
               product_id = nullif(v_item->>'product_id', '')::uuid,
               position = v_position
         where i.id = (v_item->>'id')::uuid and i.event_id = p_event_id and i.deleted_at is null
        returning i.id into v_id;
        if v_id is null then
          -- «Сделано» took this item out of the plan into a done record.
          if exists (
            select 1 from public.pet_health_items i
              join public.pet_health_events e on e.id = i.event_id
             where i.id = (v_item->>'id')::uuid and i.pet_id = p_pet_id and i.deleted_at is null
               and e.status = 'done' and e.deleted_at is null
          ) then
            raise exception 'record done' using errcode = 'LP409';
          end if;
          raise exception 'item not found' using errcode = 'no_data_found';
        end if;
      else
        insert into public.pet_health_items (event_id, user_id, pet_id, position, name, targets, product_id, interval_value, interval_unit)
        select
          p_event_id, p_user_id, p_pet_id, v_position,
          nullif(btrim(v_item->>'name'), ''),
          coalesce(array(select jsonb_array_elements_text(v_item->'targets')), '{}'),
          nullif(v_item->>'product_id', '')::uuid,
          p.interval_value,
          p.interval_unit
        from (select 1) one
        left join public.health_products p on p.id = nullif(v_item->>'product_id', '')::uuid
        returning id into v_id;
      end if;
      v_keep := v_keep || v_id;
      v_position := v_position + 1;
      v_id := null;
    end loop;

    update public.pet_health_items
       set deleted_at = now()
     where event_id = p_event_id and deleted_at is null and not (id = any (v_keep));
  end if;

  perform public.sync_pet_vaccinated(p_pet_id);
  return p_event_id;
end;
$$;

/**
 * A change of a planned visit, or «Состоялся» on it. A visit that happened is
 * refused (LP409) — except the very save that made it happen, sent again
 * with its key after a lost answer: that one changes nothing and is answered
 * with the visit, as before.
 */
create or replace function public.update_visit(
  p_user_id uuid,
  p_pet_id uuid,
  p_event_id uuid,
  p_changes jsonb,
  p_items jsonb,
  p_today date,
  p_key text default null
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
  v_hash text := md5(jsonb_build_array(p_changes, p_items)::text);
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  select * into v_event from public.pet_health_events
   where id = p_event_id and pet_id = p_pet_id and user_id = p_user_id and deleted_at is null and kind = 'visit';
  if not found then
    raise exception 'visit not found' using errcode = 'no_data_found';
  end if;

  if p_key is not null and v_event.update_key = p_key then
    if v_event.update_hash is distinct from v_hash then
      raise exception 'idempotency key reused with different data' using errcode = 'unique_violation';
    end if;
    return p_event_id;
  end if;

  if v_event.status = 'done' then
    raise exception 'record done' using errcode = 'LP409';
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
         update_key = p_key,
         update_hash = case when p_key is null then null else v_hash end,
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

/**
 * Corrects a course, or ends it («Завершить курс» sends today as the end).
 *
 * `p_over_by`: the day by which the service counts a course as finished —
 * the owner's today when the app sent it, otherwise the server's window
 * (`courseOverEverywhere`). A course that ended on or before it is history:
 * a change of it is refused (LP409), and a "change" that leaves it exactly as
 * it is — «Завершить курс» sent again after a lost answer — writes nothing
 * and is not refused. Null (a server older than this) keeps the old,
 * unguarded behaviour.
 */
drop function if exists public.change_pet_medication(uuid, uuid, uuid, jsonb, date);
create or replace function public.change_pet_medication(
  p_user_id uuid, p_pet_id uuid, p_medication_id uuid, p_changes jsonb, p_today date, p_over_by date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.pet_medications;
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  select * into v_course from public.pet_medications m
   where m.id = p_medication_id and m.pet_id = p_pet_id and m.user_id = p_user_id and m.deleted_at is null;
  if not found then
    raise exception 'medication not found' using errcode = 'no_data_found';
  end if;

  if p_over_by is not null and v_course.ended_on is not null and v_course.ended_on <= p_over_by then
    -- The same comparison as `changesCourse` in the service: texts as stored.
    if (case when p_changes ? 'name' then btrim(p_changes->>'name') else btrim(v_course.name) end) is distinct from btrim(v_course.name)
       or (case when p_changes ? 'dosage' then nullif(btrim(p_changes->>'dosage'), '') else v_course.dosage end) is distinct from v_course.dosage
       or (case when p_changes ? 'started_on' then nullif(p_changes->>'started_on', '')::date else v_course.started_on end) is distinct from v_course.started_on
       or (case when p_changes ? 'ended_on' then nullif(p_changes->>'ended_on', '')::date else v_course.ended_on end) is distinct from v_course.ended_on
       or (case when p_changes ? 'ongoing' then coalesce((p_changes->>'ongoing')::boolean, false) else v_course.ongoing end) is distinct from v_course.ongoing
    then
      raise exception 'record done' using errcode = 'LP409';
    end if;
    return;
  end if;

  update public.pet_medications m
     set name = case when p_changes ? 'name' then btrim(p_changes->>'name') else m.name end,
         dosage = case when p_changes ? 'dosage' then nullif(btrim(p_changes->>'dosage'), '') else m.dosage end,
         started_on = case when p_changes ? 'started_on' then nullif(p_changes->>'started_on', '')::date else m.started_on end,
         ended_on = case when p_changes ? 'ended_on' then nullif(p_changes->>'ended_on', '')::date else m.ended_on end,
         ongoing = case when p_changes ? 'ongoing' then coalesce((p_changes->>'ongoing')::boolean, false) else m.ongoing end,
         -- A course the owner has edited is theirs, even if the form started it.
         source = 'record',
         updated_at = now()
   where m.id = p_medication_id;

  perform public.sync_pet_medications(p_pet_id, p_today);
end;
$$;

revoke all on function public.update_health_event(uuid, uuid, uuid, date, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_visit(uuid, uuid, uuid, jsonb, jsonb, date, text) from public, anon, authenticated;
revoke all on function public.change_pet_medication(uuid, uuid, uuid, jsonb, date, date) from public, anon, authenticated;

grant execute on function public.update_health_event(uuid, uuid, uuid, date, text, text, jsonb) to service_role;
grant execute on function public.update_visit(uuid, uuid, uuid, jsonb, jsonb, date, text) to service_role;
grant execute on function public.change_pet_medication(uuid, uuid, uuid, jsonb, date, date) to service_role;
