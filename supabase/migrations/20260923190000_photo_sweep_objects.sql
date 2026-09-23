-- The photo sweeper finds objects by age, not through rows.
--
-- A signed upload URL lives two hours and is not single-use: `upsert: false`
-- only refuses a write while the object exists. Once a check has removed its
-- photo, the same URL can create it again — and no row in `photo_uploads`
-- points at that object any more, so a sweeper walking rows never sees it.
-- The same goes for a write that lands after account deletion removed a
-- person's folder. Nothing in this bucket is meant to outlive three hours
-- (fifteen minutes to attach, plus the analysis), so age alone decides.

create or replace function public.stale_photo_objects(p_cutoff timestamptz, p_limit integer)
returns setof text
language sql
security definer
set search_path = public
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'check-photos'
     and o.created_at < p_cutoff
   order by o.created_at
   limit p_limit;
$$;

revoke all on function public.stale_photo_objects(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stale_photo_objects(timestamptz, integer) to service_role;
