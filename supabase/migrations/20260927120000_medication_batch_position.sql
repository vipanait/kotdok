-- The order of courses saved together (MW-09).
--
-- One save of the course form is one batch of rows sharing a key, and they
-- share their created_at too: a repeated batch was read back by key in no
-- particular order. Each row now keeps its place in the batch, so the repeat
-- answers with the courses in the order they were entered, as the first
-- answer did. Rows from before have none; they keep the old order.

alter table public.pet_medications add column if not exists batch_position smallint;

/** New courses from the medical record: all of them or none, once per key, in the order given. */
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
  v_index int := 0;
  v_id uuid;
begin
  perform public.lock_own_pet(p_user_id, p_pet_id);

  if p_key is not null then
    select request_hash into v_existing from public.pet_medications
     where user_id = p_user_id and idempotency_key = p_key limit 1;
    if found then
      -- The key is per request, and a request is for one pet.
      if v_existing is distinct from v_hash
         or not exists (select 1 from public.pet_medications where user_id = p_user_id and idempotency_key = p_key and pet_id = p_pet_id) then
        raise exception 'idempotency key reused with different data' using errcode = 'unique_violation';
      end if;
      select coalesce(array_agg(id order by batch_position nulls last, created_at, id), '{}') into v_ids
        from public.pet_medications
       where user_id = p_user_id and idempotency_key = p_key and pet_id = p_pet_id and deleted_at is null;
      return v_ids;
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.pet_medications (
      user_id, pet_id, name, dosage, started_on, ended_on, ongoing, source, idempotency_key, request_hash, batch_position
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
      v_hash,
      v_index
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_index := v_index + 1;
  end loop;

  perform public.sync_pet_medications(p_pet_id, p_today);
  return v_ids;
end;
$$;

revoke all on function public.create_pet_medications(uuid, uuid, jsonb, date, text) from public, anon, authenticated;
grant execute on function public.create_pet_medications(uuid, uuid, jsonb, date, text) to service_role;
