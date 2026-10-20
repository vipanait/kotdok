-- A pet's photo (FB-4).
--
-- Unlike a check's photos, this one is kept: it shows the pet on its card
-- until the owner replaces or removes it, or the pet or the account goes.
-- Its own private bucket, so the check-photo sweep (by age alone) never
-- reaches it. As there, the phone writes the file through a signed upload
-- URL and the server is told only the path; no policies on storage.objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-avatars', 'pet-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- `<user_id>/<pet_id>/<uuid>`: the object the pet shows now.
alter table public.pets add column if not exists avatar_path text;

create unique index if not exists pets_avatar_path_key on public.pets (avatar_path) where avatar_path is not null;

-- Uploads granted and never confirmed, or replaced while the old object
-- could not be removed: objects no pet points at, older than the cutoff.
create or replace function public.stale_avatar_objects(p_cutoff timestamptz, p_limit integer)
returns setof text
language sql
security definer
set search_path = public
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'pet-avatars'
     and o.created_at < p_cutoff
     and not exists (select 1 from public.pets p where p.avatar_path = o.name)
   order by o.created_at
   limit p_limit;
$$;

revoke all on function public.stale_avatar_objects(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stale_avatar_objects(timestamptz, integer) to service_role;
