-- Uploads come back in the order the person picked them.
--
-- `update ... returning` hands rows back in whatever order the update visited
-- them. The photos go to the model in the order this function returns, so a
-- prompt that ever says "the second photo" must mean the second one chosen.
-- The locking and the all-or-none rule are unchanged from 20260923180000.

create or replace function public.claim_photo_uploads(p_user_id uuid, p_ids uuid[])
returns table (id uuid, object_path text, content_type text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Lock first, then count. Two checks racing for one upload both wait here;
  -- the second re-reads the row after the first commits, finds `attached_at`
  -- set, and counts one short. Column names are qualified throughout: the
  -- output columns `id`, `object_path`, `content_type` are variables here.
  select count(*) into v_count
    from (
      select 1
        from public.photo_uploads u
       where u.id = any(p_ids)
         and u.user_id = p_user_id
         and u.attached_at is null
         and u.expires_at > now()
         for update
    ) as usable;

  if v_count <> coalesce(cardinality(p_ids), 0) then
    raise exception 'uploads_unavailable' using errcode = 'P0001';
  end if;

  update public.photo_uploads u
     set attached_at = now()
   where u.id = any(p_ids)
     and u.user_id = p_user_id;

  return query
    select u.id, u.object_path, u.content_type
      from public.photo_uploads u
     where u.id = any(p_ids)
       and u.user_id = p_user_id
     order by array_position(p_ids, u.id);
end;
$$;

revoke all on function public.claim_photo_uploads(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_photo_uploads(uuid, uuid[]) to service_role;
