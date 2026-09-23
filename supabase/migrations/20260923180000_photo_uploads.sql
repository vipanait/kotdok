-- Photographs on a symptom check (stage 6/01–6/03).
--
-- Vercel cuts off any request body over 4.5 MB before our code runs, and a
-- couple of phone photos were enough to hit that (open question 0.1). So photos
-- never pass through the server: the phone writes each one straight into a
-- private bucket through a signed upload URL, and the server is told only the
-- upload's id.
--
-- Nothing here is kept. The owner decided on 6 September 2026 that a photo
-- lives only as long as its analysis: removed right after it, successful or
-- not, and an abandoned upload is swept once its grant has run out. The table
-- is the server's record of what it handed out, not a gallery.

-- The bucket is created here and not in config.toml: `supabase config push` is
-- never run against hosted projects, it would overwrite their auth URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('check-photos', 'check-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No policies on storage.objects for this bucket, on purpose: neither `anon`
-- nor `authenticated` may read, list, overwrite or delete a photo. Writing
-- happens only through a signed upload URL the server issued, and it refuses
-- to overwrite an existing object.

create table if not exists public.photo_uploads (
  id uuid primary key default gen_random_uuid(),

  -- Cascading: the deletion worker removes the objects first (step `photos`),
  -- and a row whose object is gone describes nothing.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- `<user_id>/<id>`. Unique, so one grant is one object.
  object_path text not null unique,

  content_type text not null,
  size_bytes integer not null,

  created_at timestamptz not null default now(),

  -- Until when the upload may be attached to a check. Shorter than the signed
  -- URL itself, whose two hours Storage fixes and we cannot change.
  expires_at timestamptz not null,

  -- Set when a check takes the upload. Once set, no other check can.
  attached_at timestamptz
);

alter table public.photo_uploads
  drop constraint if exists photo_uploads_content_type_check;
alter table public.photo_uploads
  add constraint photo_uploads_content_type_check
  check (content_type in ('image/jpeg', 'image/png', 'image/webp'));

alter table public.photo_uploads
  drop constraint if exists photo_uploads_size_check;
alter table public.photo_uploads
  add constraint photo_uploads_size_check
  check (size_bytes between 1 and 5242880);

-- The sweeper walks uploads by age; account deletion by owner.
create index if not exists photo_uploads_created_idx on public.photo_uploads (created_at);
create index if not exists photo_uploads_user_idx on public.photo_uploads (user_id);

alter table public.photo_uploads enable row level security;
-- No policies: only the service role touches this table.
revoke all on public.photo_uploads from anon, authenticated;

-- Takes uploads for one check: all of them, or none.
--
-- All-or-none because a check analysed with two of the three photos the person
-- attached would look to them like the third was considered.
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

  return query
    update public.photo_uploads u
       set attached_at = now()
     where u.id = any(p_ids)
       and u.user_id = p_user_id
    returning u.id, u.object_path, u.content_type;
end;
$$;

revoke all on function public.claim_photo_uploads(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_photo_uploads(uuid, uuid[]) to service_role;

-- The deletion worker gets a step before `data`: photos in Storage are not rows
-- a transaction can remove, and they must be gone before the Auth user is.
create or replace function public.mark_deletion_step(p_user_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_step not in ('photos', 'data', 'auth') then
    raise exception 'unknown deletion step %', p_step using errcode = 'invalid_parameter_value';
  end if;

  update public.deletion_jobs
     set progress = progress || jsonb_build_object(p_step, now()),
         updated_at = now()
   where user_id = p_user_id
     and status in ('pending', 'in_progress');

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'no active deletion job for %', p_user_id using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.mark_deletion_step(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_deletion_step(uuid, text) to service_role;
