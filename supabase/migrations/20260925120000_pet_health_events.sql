-- Vaccinations and plans for the medical record (MR-03).
--
-- A record is an event — a day, a clinic, a note — with one or more items:
-- one vaccine each, with the diseases it covers. An event is either done (in
-- the past) or planned (on a day to come). Every planned item is a due date;
-- there is no other source of reminders (spec §2.5).
--
-- "Next" on a done item is stored as a planned item that points back at it
-- (`source_item_id`). Marking one planned item done moves only that item into
-- a done event of its own, so a second vaccine planned for the same day stays
-- planned (spec §7.16).
--
-- Writes go only through the functions below, called by the server with the
-- service role. Each locks the pet first, and each takes an idempotency key:
-- the same request twice gives the same event once.
--
-- Parasite treatments and visits (MR-05, MR-07) will use the same tables with
-- their own `kind`.

create table if not exists public.pet_health_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  kind text not null,
  status text not null,
  -- A calendar day, as for weights: when it was done, or when it is due.
  event_date date not null,
  clinic text,
  notes text,
  idempotency_key text,
  -- What the keyed request asked for: the same key with other data is a
  -- conflict, not a silent return of the first record.
  request_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.pet_health_events drop constraint if exists pet_health_events_kind_check;
alter table public.pet_health_events add constraint pet_health_events_kind_check check (kind in ('vaccination'));

alter table public.pet_health_events drop constraint if exists pet_health_events_status_check;
alter table public.pet_health_events add constraint pet_health_events_status_check check (status in ('done', 'planned'));

alter table public.pet_health_events drop constraint if exists pet_health_events_text_check;
alter table public.pet_health_events add constraint pet_health_events_text_check
  check (char_length(coalesce(clinic, '')) <= 100 and char_length(coalesce(notes, '')) <= 300);

alter table public.pet_health_events add column if not exists request_hash text;

create unique index if not exists pet_health_events_idempotency
  on public.pet_health_events (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists pet_health_events_pet_idx on public.pet_health_events (pet_id, event_date) where deleted_at is null;
create index if not exists pet_health_events_user_idx on public.pet_health_events (user_id);

create table if not exists public.pet_health_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pet_health_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  position smallint not null default 0,
  -- The vaccine as the owner named it; null is «Без препарата».
  name text,
  -- Disease codes from packages/contracts (health-targets.ts).
  targets text[] not null default '{}',
  -- The done item this plan was made from, if any.
  source_item_id uuid references public.pet_health_items(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.pet_health_items drop constraint if exists pet_health_items_named_check;
alter table public.pet_health_items add constraint pet_health_items_named_check
  check ((name is not null and char_length(name) between 1 and 100) or cardinality(targets) > 0);

alter table public.pet_health_items drop constraint if exists pet_health_items_targets_check;
alter table public.pet_health_items add constraint pet_health_items_targets_check check (cardinality(targets) <= 12);

create index if not exists pet_health_items_event_idx on public.pet_health_items (event_id) where deleted_at is null;
create index if not exists pet_health_items_user_idx on public.pet_health_items (user_id);

alter table public.pet_health_events enable row level security;
alter table public.pet_health_items enable row level security;

drop policy if exists "Users see own health events" on public.pet_health_events;
create policy "Users see own health events" on public.pet_health_events
  for select using (auth.uid() = user_id and public.current_account_is_active());

drop policy if exists "Users see own health items" on public.pet_health_items;
create policy "Users see own health items" on public.pet_health_items
  for select using (auth.uid() = user_id and public.current_account_is_active());

revoke insert, update, delete, truncate, references, trigger on public.pet_health_events from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.pet_health_items from anon, authenticated;

drop trigger if exists refuse_late_writes on public.pet_health_events;
create trigger refuse_late_writes
  before insert or update on public.pet_health_events
  for each row execute function public.refuse_write_for_inactive_account();

drop trigger if exists refuse_late_writes on public.pet_health_items;
create trigger refuse_late_writes
  before insert or update on public.pet_health_items
  for each row execute function public.refuse_write_for_inactive_account();

-- The owner's own answer to «Вакцинация», kept apart from `vaccinated`,
-- which now says what the record knows: vaccinated if a vaccination is done,
-- otherwise whatever the owner said (spec §4). Every reader of `vaccinated` —
-- the form, the symptom check — gets that without knowing about records, and
-- deleting the last vaccination gives the owner's answer back instead of
-- deciding "not vaccinated" for them.
alter table public.pets add column if not exists vaccinated_form boolean;
update public.pets set vaccinated_form = vaccinated where vaccinated_form is null and vaccinated is not null;

create or replace function public.sync_pet_vaccinated(p_pet_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pets p
     set vaccinated = case
       when exists (
         select 1 from public.pet_health_events e
          where e.pet_id = p_pet_id and e.kind = 'vaccination' and e.status = 'done' and e.deleted_at is null
            and exists (select 1 from public.pet_health_items i where i.event_id = e.id and i.deleted_at is null)
       ) then true
       else p.vaccinated_form
     end
   where p.id = p_pet_id;
$$;

/**
 * An existing event made with this key, if any: a repeated request returns
 * it instead of making a second one. The same key with other data is refused
 * with unique_violation — the first request's result stands, and the caller
 * must look at it rather than believe the second was saved.
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
  if v_id is not null and v_hash is distinct from p_hash then
    raise exception 'idempotency key reused with different data' using errcode = 'unique_violation';
  end if;
  return v_id;
end;
$$;

/**
 * Adds items to an event from a JSON array of `{name, targets}`, in order.
 * Returns their ids in the same order.
 */
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
    insert into public.pet_health_items (event_id, user_id, pet_id, position, name, targets, source_item_id)
    values (
      p_event_id, p_user_id, p_pet_id, v_index,
      nullif(btrim(v_item->>'name'), ''),
      coalesce(array(select jsonb_array_elements_text(v_item->'targets')), '{}'),
      case when p_source_ids is null then null else p_source_ids[v_index + 1] end
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_index := v_index + 1;
  end loop;
  return v_ids;
end;
$$;

/**
 * Plans the next date for done items: one planned event per distinct day,
 * each item a copy that points back at the item it follows.
 * `p_next` is a JSON array parallel to the items: a day or null.
 */
create or replace function public.plan_next_items(
  p_user_id uuid, p_pet_id uuid, p_kind text, p_clinic text, p_item_ids uuid[], p_items jsonb, p_next jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
  v_event uuid;
  v_group jsonb;
  v_sources uuid[];
  v_index int;
begin
  for v_day in
    select distinct (value #>> '{}')::date
      from jsonb_array_elements(p_next)
     where jsonb_typeof(value) = 'string'
     order by 1
  loop
    v_group := '[]'::jsonb;
    v_sources := '{}';
    for v_index in 0 .. jsonb_array_length(p_next) - 1
    loop
      if jsonb_typeof(p_next->v_index) = 'string' and (p_next->>v_index)::date = v_day then
        v_group := v_group || jsonb_build_array(p_items->v_index);
        v_sources := v_sources || p_item_ids[v_index + 1];
      end if;
    end loop;

    insert into public.pet_health_events (user_id, pet_id, kind, status, event_date, clinic)
    values (p_user_id, p_pet_id, p_kind, 'planned', v_day, p_clinic)
    returning id into v_event;

    perform public.insert_health_items(p_user_id, p_pet_id, v_event, v_group, v_sources);
  end loop;
end;
$$;

/**
 * A new record: one event, its items, and for a done one the next plans —
 * all of it or none of it.
 *
 * `p_items` is `[{name, targets, next_on}]`; `next_on` is ignored on a plan.
 */
create or replace function public.create_health_event(
  p_user_id uuid,
  p_pet_id uuid,
  p_kind text,
  p_status text,
  p_date date,
  p_clinic text,
  p_notes text,
  p_items jsonb,
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
  v_next jsonb;
  v_hash text := md5(jsonb_build_array(p_kind, p_status, p_date, p_clinic, p_notes, p_items)::text);
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  v_event := public.health_event_by_key(p_user_id, p_key, v_hash);
  if v_event is not null then
    return v_event;
  end if;

  insert into public.pet_health_events (user_id, pet_id, kind, status, event_date, clinic, notes, idempotency_key, request_hash)
  values (p_user_id, p_pet_id, p_kind, p_status, p_date, nullif(btrim(p_clinic), ''), nullif(btrim(p_notes), ''), p_key, v_hash)
  returning id into v_event;

  v_ids := public.insert_health_items(p_user_id, p_pet_id, v_event, p_items);

  if p_status = 'done' then
    select coalesce(jsonb_agg(item->'next_on'), '[]'::jsonb) into v_next from jsonb_array_elements(p_items) item;
    perform public.plan_next_items(p_user_id, p_pet_id, p_kind, nullif(btrim(p_clinic), ''), v_ids, p_items, v_next);
  end if;

  perform public.sync_pet_vaccinated(p_pet_id);
  return v_event;
end;
$$;

/**
 * Marks one planned item done on `p_done_on`.
 *
 * The only item of its plan turns the plan into the done record; one of
 * several moves into a done record of its own and the others stay planned.
 * With `p_next_on`, the item's next plan follows. Doing it twice — the same
 * key, or an item already done — returns the done record without a second one.
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

  select count(*) into v_others
    from public.pet_health_items
   where event_id = v_event.id and id <> v_item.id and deleted_at is null;

  if v_others = 0 then
    update public.pet_health_events
       set status = 'done',
           event_date = p_done_on,
           clinic = coalesce(nullif(btrim(p_clinic), ''), clinic),
           notes = coalesce(nullif(btrim(p_notes), ''), notes),
           -- The plan keeps the key it was created with: a late retry of that
           -- create must still find it. Doing it twice is caught above, by
           -- the item already being done.
           updated_at = now()
     where id = v_event.id;
    v_done := v_event.id;
  else
    insert into public.pet_health_events (user_id, pet_id, kind, status, event_date, clinic, notes, idempotency_key, request_hash)
    values (
      p_user_id, p_pet_id, v_event.kind, 'done', p_done_on,
      coalesce(nullif(btrim(p_clinic), ''), v_event.clinic), nullif(btrim(p_notes), ''), p_key, v_hash
    )
    returning id into v_done;

    update public.pet_health_items set event_id = v_done, position = 0 where id = v_item.id;
    update public.pet_health_events set updated_at = now() where id = v_event.id;
  end if;

  if p_next_on is not null then
    perform public.plan_next_items(
      p_user_id, p_pet_id, v_event.kind, coalesce(nullif(btrim(p_clinic), ''), v_event.clinic),
      array[v_item.id],
      jsonb_build_array(jsonb_build_object('name', v_item.name, 'targets', to_jsonb(v_item.targets))),
      jsonb_build_array(to_jsonb(p_next_on::text))
    );
  end if;

  perform public.sync_pet_vaccinated(p_pet_id);
  return v_done;
end;
$$;

/**
 * Corrects a record: its day, clinic and note, and — when `p_items` is given —
 * its items: `{id, name, targets}` keeps and updates that item, no `id` adds
 * one, and an item left out is removed. A null argument keeps the field.
 * Plans made from its items are not touched: they are records of their own.
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
   where id = p_event_id and pet_id = p_pet_id and user_id = p_user_id and deleted_at is null;
  if not found then
    raise exception 'event not found' using errcode = 'no_data_found';
  end if;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      if v_item ? 'id' and v_item->>'id' is not null then
        update public.pet_health_items
           set name = nullif(btrim(v_item->>'name'), ''),
               targets = coalesce(array(select jsonb_array_elements_text(v_item->'targets')), '{}'),
               position = v_position
         where id = (v_item->>'id')::uuid and event_id = p_event_id and deleted_at is null
        returning id into v_id;
        if v_id is null then
          raise exception 'item not found' using errcode = 'no_data_found';
        end if;
      else
        insert into public.pet_health_items (event_id, user_id, pet_id, position, name, targets)
        values (
          p_event_id, p_user_id, p_pet_id, v_position,
          nullif(btrim(v_item->>'name'), ''),
          coalesce(array(select jsonb_array_elements_text(v_item->'targets')), '{}')
        )
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

/** Deletes a done record or cancels a plan. Plans made from it stay. */
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

  update public.pet_health_items set deleted_at = now() where event_id = p_event_id and deleted_at is null;
  perform public.sync_pet_vaccinated(p_pet_id);
end;
$$;

drop function if exists public.health_event_by_key(uuid, text);
revoke all on function public.health_event_by_key(uuid, text, text) from public, anon, authenticated;
revoke all on function public.sync_pet_vaccinated(uuid) from public, anon, authenticated;
grant execute on function public.sync_pet_vaccinated(uuid) to service_role;
revoke all on function public.insert_health_items(uuid, uuid, uuid, jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.plan_next_items(uuid, uuid, text, text, uuid[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_health_event(uuid, uuid, text, text, date, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.complete_health_item(uuid, uuid, uuid, date, date, text, text, text) from public, anon, authenticated;
revoke all on function public.update_health_event(uuid, uuid, uuid, date, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_health_event(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_health_event(uuid, uuid, text, text, date, text, text, jsonb, text) to service_role;
grant execute on function public.complete_health_item(uuid, uuid, uuid, date, date, text, text, text) to service_role;
grant execute on function public.update_health_event(uuid, uuid, uuid, date, text, text, jsonb) to service_role;
grant execute on function public.delete_health_event(uuid, uuid, uuid) to service_role;
