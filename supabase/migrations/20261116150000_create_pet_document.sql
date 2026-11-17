-- Pet documents (DOC-1): the 30-per-pet cap, enforced where the rows are written.
--
-- Counting in the service and then inserting lets parallel creates all see 29
-- and all insert. This function takes the pet's row lock first, so two creates
-- for one pet queue up: the second counts after the first has inserted.
-- Returns 'ok', 'not_found' (no such live pet of this user) or 'limit_reached'.
create or replace function public.create_pet_document(
  p_user_id uuid,
  p_pet_id uuid,
  p_document_id uuid,
  p_kind text,
  p_title text,
  p_files jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked uuid;
  v_count integer;
begin
  select id into v_locked
    from public.pets
   where id = p_pet_id and user_id = p_user_id and deleted_at is null
     for update;
  if v_locked is null then
    return 'not_found';
  end if;

  select count(*) into v_count
    from public.pet_documents
   where pet_id = p_pet_id and user_id = p_user_id;
  if v_count >= 30 then
    return 'limit_reached';
  end if;

  insert into public.pet_documents (id, user_id, pet_id, kind, title)
  values (p_document_id, p_user_id, p_pet_id, p_kind, p_title);

  insert into public.pet_document_files (id, document_id, user_id, position, object_path, content_type, size_bytes)
  select f.id, p_document_id, p_user_id, f.position, f.object_path, f.content_type, f.size_bytes
    from jsonb_to_recordset(p_files)
      as f(id uuid, position integer, object_path text, content_type text, size_bytes integer);

  return 'ok';
end;
$$;

revoke all on function public.create_pet_document(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_pet_document(uuid, uuid, uuid, text, text, jsonb) to service_role;
