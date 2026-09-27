-- «Сделано»: its own key on a plan of one item, and fields the owner cleared (MW-09).
--
-- 1. A plan of one item becomes the done record itself and keeps the key it
--    was created with (a late retry of that create must still find it), so
--    the key of the «Сделано» was stored nowhere: the same key sent again
--    with other data was answered 200 with the record, not 409. It is now
--    kept beside the plan's own, in `complete_key` / `complete_hash`, and
--    looked up with every other key of the owner's records.
--
-- 2. An empty clinic or note used to fall back to the plan's: the owner could
--    not clear them. The request now tells "not sent" from "sent empty":
--    null (or absent) keeps the plan's text, as every installed app sends for
--    an empty field; an empty string clears it. The apps from MW-09 on start
--    both fields from the plan's text and send '' for a field the owner
--    emptied.

alter table public.pet_health_events add column if not exists complete_key text;
alter table public.pet_health_events add column if not exists complete_hash text;

create unique index if not exists pet_health_events_complete_key
  on public.pet_health_events (user_id, complete_key)
  where complete_key is not null;

/**
 * An existing record made — or marked done — with this key, if any: a
 * repeated request returns it instead of making a second one. The same key
 * with other data is refused with unique_violation, whichever request used
 * it first.
 */
create or replace function public.health_event_by_key(p_user_id uuid, p_key text, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_hash text;
begin
  if p_key is null then
    return null;
  end if;
  select id, request_hash into v_id, v_hash
    from public.pet_health_events
   where user_id = p_user_id and idempotency_key = p_key
   limit 1;
  if v_id is null then
    select id, complete_hash into v_id, v_hash
      from public.pet_health_events
     where user_id = p_user_id and complete_key = p_key
     limit 1;
  end if;
  if v_id is not null and v_hash is distinct from p_hash then
    raise exception 'idempotency key reused with different data' using errcode = 'unique_violation';
  end if;
  return v_id;
end;
$$;

/**
 * Marks one planned item done on `p_done_on`.
 *
 * The only item of its plan turns the plan into the done record; one of
 * several moves into a done record of its own and the others stay planned.
 * With `p_next_on`, the item's next plan follows. The same key twice returns
 * the done record; the same key with other data is unique_violation. An item
 * already done under another key returns its record as it was.
 *
 * `p_clinic` / `p_notes`: null keeps the plan's text, '' clears it.
 */
create or replace function public.complete_health_item(
  p_user_id uuid,
  p_pet_id uuid,
  p_item_id uuid,
  p_done_on date,
  p_next_on date,
  p_clinic text,
  p_notes text,
  p_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_item public.pet_health_items;
  v_event public.pet_health_events;
  v_others int;
  v_done uuid;
  v_clinic text;
  v_hash text := md5(jsonb_build_array('complete', p_item_id, p_done_on, p_next_on, p_clinic, p_notes)::text);
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  v_existing := public.health_event_by_key(p_user_id, p_key, v_hash);
  if v_existing is not null then
    return v_existing;
  end if;

  select i.* into v_item
    from public.pet_health_items i
   where i.id = p_item_id and i.pet_id = p_pet_id and i.user_id = p_user_id and i.deleted_at is null;
  if not found then
    raise exception 'item not found' using errcode = 'no_data_found';
  end if;

  select * into v_event from public.pet_health_events where id = v_item.event_id and deleted_at is null;
  if not found then
    raise exception 'item not found' using errcode = 'no_data_found';
  end if;

  if v_event.status = 'done' then
    return v_event.id;
  end if;

  -- What the done record, and the next plan made from it, are at.
  v_clinic := case when p_clinic is null then v_event.clinic else nullif(btrim(p_clinic), '') end;

  select count(*) into v_others
    from public.pet_health_items
   where event_id = v_event.id and id <> v_item.id and deleted_at is null;

  if v_others = 0 then
    update public.pet_health_events
       set status = 'done',
           event_date = p_done_on,
           clinic = v_clinic,
           notes = case when p_notes is null then notes else nullif(btrim(p_notes), '') end,
           -- The plan keeps the key it was created with: a late retry of that
           -- create must still find it. This request's key goes beside it.
           complete_key = p_key,
           complete_hash = case when p_key is null then null else v_hash end,
           updated_at = now()
     where id = v_event.id;
    v_done := v_event.id;
  else
    insert into public.pet_health_events (user_id, pet_id, kind, status, event_date, clinic, notes, idempotency_key, request_hash)
    values (
      p_user_id, p_pet_id, v_event.kind, 'done', p_done_on,
      v_clinic, nullif(btrim(p_notes), ''), p_key, v_hash
    )
    returning id into v_done;

    update public.pet_health_items set event_id = v_done, position = 0 where id = v_item.id;
    update public.pet_health_events set updated_at = now() where id = v_event.id;
  end if;

  if p_next_on is not null then
    perform public.plan_next_items(
      p_user_id, p_pet_id, v_event.kind, v_clinic,
      array[v_item.id],
      jsonb_build_array(jsonb_build_object('name', v_item.name, 'targets', to_jsonb(v_item.targets), 'product_id', v_item.product_id, 'interval_value', v_item.interval_value, 'interval_unit', v_item.interval_unit)),
      jsonb_build_array(to_jsonb(p_next_on::text))
    );
  end if;

  perform public.sync_pet_vaccinated(p_pet_id);
  return v_done;
end;
$$;

revoke all on function public.health_event_by_key(uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_health_item(uuid, uuid, uuid, date, date, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_health_item(uuid, uuid, uuid, date, date, text, text, text) to service_role;
