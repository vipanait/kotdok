-- The catalogue of vaccines and treatments (MR-04).
--
-- Kept by the team, read by everyone, written by nobody else. A record does
-- not point at the catalogue for its meaning: an item keeps its own copy of
-- the name and diseases (a snapshot), and `product_id` only says where it
-- came from. Correcting a product later changes no history and no plan.
--
-- The migration creates the tables empty. The draft list from the spec lives
-- in supabase/catalog/draft-vaccines.sql, marked unverified, and is loaded
-- only into test and local stacks: nothing reaches owners before a vet has
-- checked it (spec §5.4, open question 2).

create table if not exists public.health_products (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null,
  manufacturer text,
  -- Other spellings to search by: the Latin name of a Russian-named product.
  aliases text[] not null default '{}',
  species text[] not null,
  form text,
  -- Disease codes from packages/contracts (health-targets.ts).
  targets text[] not null,
  interval_value integer,
  interval_unit text,
  -- Lower comes first under «Популярные»; null is not shown there.
  popularity integer,
  -- Only verified products are shown to owners; see catalog-service.ts.
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.health_products drop constraint if exists health_products_kind_check;
alter table public.health_products add constraint health_products_kind_check check (kind in ('vaccine', 'antiparasitic'));

alter table public.health_products drop constraint if exists health_products_species_check;
alter table public.health_products add constraint health_products_species_check
  check (cardinality(species) > 0 and species <@ array['cat', 'dog']);

alter table public.health_products drop constraint if exists health_products_interval_check;
alter table public.health_products add constraint health_products_interval_check
  check (
    (interval_value is null and interval_unit is null)
    or (interval_value > 0 and interval_unit in ('day', 'week', 'month', 'year'))
  );

create unique index if not exists health_products_name_kind on public.health_products (kind, lower(name));

alter table public.health_products enable row level security;

drop policy if exists "Anyone signed in reads the catalogue" on public.health_products;
create policy "Anyone signed in reads the catalogue" on public.health_products
  for select using (auth.uid() is not null and verified and active);

revoke insert, update, delete, truncate, references, trigger on public.health_products from anon, authenticated;

-- Where an item was picked from. A snapshot of the product stays on the item:
-- its name and diseases, and the repeat interval «Сделано» suggests next time.
alter table public.pet_health_items
  add column if not exists product_id uuid references public.health_products(id) on delete set null;
alter table public.pet_health_items add column if not exists interval_value integer;
alter table public.pet_health_items add column if not exists interval_unit text;

alter table public.pet_health_items drop constraint if exists pet_health_items_interval_check;
alter table public.pet_health_items add constraint pet_health_items_interval_check
  check (
    (interval_value is null and interval_unit is null)
    or (interval_value > 0 and interval_unit in ('day', 'week', 'month', 'year'))
  );

create index if not exists pet_health_items_product_idx on public.pet_health_items (product_id) where product_id is not null;

/**
 * insert_health_items and update_health_event read `product_id` from each
 * item's JSON as well; the server has checked it belongs to the pet's species.
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
    insert into public.pet_health_items (
      event_id, user_id, pet_id, position, name, targets, source_item_id, product_id, interval_value, interval_unit
    )
    select
      p_event_id, p_user_id, p_pet_id, v_index,
      nullif(btrim(v_item->>'name'), ''),
      coalesce(array(select jsonb_array_elements_text(v_item->'targets')), '{}'),
      case when p_source_ids is null then null else p_source_ids[v_index + 1] end,
      nullif(v_item->>'product_id', '')::uuid,
      -- A plan made from an item carries that item's interval; a new item
      -- takes the product's as it is now.
      coalesce((v_item->>'interval_value')::integer, p.interval_value),
      coalesce(v_item->>'interval_unit', p.interval_unit)
    from (select 1) one
    left join public.health_products p on p.id = nullif(v_item->>'product_id', '')::uuid
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_index := v_index + 1;
  end loop;
  return v_ids;
end;
$$;

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

/** Plans made from done items carry the item's product along with its snapshot. */
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

-- The next plan of a completed item keeps the product it was picked from.
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
      jsonb_build_array(jsonb_build_object('name', v_item.name, 'targets', to_jsonb(v_item.targets), 'product_id', v_item.product_id, 'interval_value', v_item.interval_value, 'interval_unit', v_item.interval_unit)),
      jsonb_build_array(to_jsonb(p_next_on::text))
    );
  end if;

  perform public.sync_pet_vaccinated(p_pet_id);
  return v_done;
end;
$$;


revoke all on function public.insert_health_items(uuid, uuid, uuid, jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.plan_next_items(uuid, uuid, text, text, uuid[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_health_event(uuid, uuid, uuid, date, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_health_item(uuid, uuid, uuid, date, date, text, text, text) from public, anon, authenticated;
grant execute on function public.update_health_event(uuid, uuid, uuid, date, text, text, jsonb) to service_role;
grant execute on function public.complete_health_item(uuid, uuid, uuid, date, date, text, text, text) to service_role;
