-- Pet documents (DOC-1): photos of pages or one PDF kept with the pet.
-- The spec: docs/superpowers/specs/2026-11-13-pet-documents-recognition-design.md.
--
-- Only the server reaches these tables, as check_jobs: RLS on, no policies,
-- every privilege revoked. Foreign keys cascade and none sets NULL: a SET NULL
-- is an UPDATE, and an UPDATE on an account being deleted is refused by
-- refuse_late_writes (see 20261025110000). The files live in their own private
-- bucket; the phone writes them through a signed upload URL and the server is
-- told only that it is done.

create table if not exists public.pet_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  kind text not null check (kind in ('vet_passport', 'prescription', 'discharge', 'lab_results', 'other')),
  -- May be empty: the apps then show the kind's name.
  title text not null default '' check (char_length(title) <= 100),
  -- The date written on the document, when the owner or the AI knows it.
  document_date date,
  status text not null default 'pending'
    check (status in ('pending', 'stored', 'recognizing', 'review', 'confirmed', 'failed')),
  -- DOC-2: the suggested records; empty outside `review`.
  draft jsonb,
  failure_code text,
  -- DOC-2: how the last recognition was paid for.
  charge text check (charge in ('free', 'credit')),
  usage_ledger_id uuid,
  recognized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pet_documents_pet on public.pet_documents (pet_id, created_at desc);
-- The sweep looks for old `pending` rows.
create index if not exists pet_documents_pending on public.pet_documents (created_at) where status = 'pending';
create index if not exists pet_documents_user on public.pet_documents (user_id);

create table if not exists public.pet_document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.pet_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  -- `<user_id>/<pet_id>/<document_id>/<uuid>`
  object_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes > 0),
  -- PDF: how many pages it has; a picture is one.
  page_count integer check (page_count > 0),
  verified_at timestamptz,
  unique (document_id, position)
);

create index if not exists pet_document_files_user on public.pet_document_files (user_id);

alter table public.pet_documents enable row level security;
alter table public.pet_document_files enable row level security;
revoke all on public.pet_documents from anon, authenticated;
revoke all on public.pet_document_files from anon, authenticated;

-- An account being deleted takes no more writes, as every per-user table.
drop trigger if exists refuse_late_writes on public.pet_documents;
create trigger refuse_late_writes
  before insert or update on public.pet_documents
  for each row execute function public.refuse_write_for_inactive_account();
drop trigger if exists refuse_late_writes on public.pet_document_files;
create trigger refuse_late_writes
  before insert or update on public.pet_document_files
  for each row execute function public.refuse_write_for_inactive_account();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-documents', 'pet-documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Uploads granted and never completed, or left behind by a removal that
-- failed: objects older than the cutoff that no file of a document past
-- `pending` points at. A `pending` document's own objects are removed with it
-- by the sweep, and one that is already gone leaves them here.
create or replace function public.stale_document_objects(p_cutoff timestamptz, p_limit integer)
returns setof text
language sql
security definer
set search_path = public
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'pet-documents'
     and o.created_at < p_cutoff
     and not exists (
       select 1
         from public.pet_document_files f
         join public.pet_documents d on d.id = f.document_id
        where f.object_path = o.name and d.status <> 'pending'
     )
   order by o.created_at
   limit p_limit;
$$;

revoke all on function public.stale_document_objects(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stale_document_objects(timestamptz, integer) to service_role;

-- Account deletion, from its latest definition (20261025110000) with the two
-- document tables added before the pets.
create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'delete_account_data requires a user id';
  end if;

  -- A missing profile is a repeat run: the first call already removed it, and
  -- there is nothing left here to protect. A profile that exists and is not
  -- `deleting` is a different account entirely — nobody asked for it to be
  -- removed, and this function must refuse to guess otherwise.
  if exists (select 1 from public.profiles where id = p_user_id and status <> 'deleting') then
    raise exception 'account % is not being deleted', p_user_id using errcode = 'check_violation';
  end if;

  delete from public.check_jobs where user_id = p_user_id;

  perform public.archive_account_financials(p_user_id);

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transaction_status_events', e.id, coalesce(e.created_at, now()), to_jsonb(e)
    from retired.transaction_status_events e
    join retired.transactions t on t.id = e.transaction_id
   where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transactions', t.id, coalesce(t.created_at, now()), to_jsonb(t)
    from retired.transactions t
   where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  -- Status events go with their transaction by cascade.
  delete from retired.transactions where user_id = p_user_id;

  -- `retired.credit_transactions.created_at` is a nullable, zone-less legacy
  -- column (billing v1, never migrated) — unlike the two inserts above, a null
  -- here is expected, not defensive. `financial_archive.occurred_at` is `not
  -- null`, so it still needs a fallback.
  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select c.user_id, 'credit_transactions', c.id, coalesce(c.created_at at time zone 'UTC', now()), to_jsonb(c)
    from retired.credit_transactions c
   where c.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  delete from retired.credit_transactions where user_id = p_user_id;

  -- The medical record goes before the checks. A visit points at the check it
  -- was recorded from, a course at the prescription it came from and a plan
  -- at the done item it followed, all ON DELETE SET NULL. Deleting the check
  -- first nulls that link with an UPDATE, which refuse_late_writes refuses on
  -- an account being deleted, and the whole deletion stops. Deletes are not
  -- guarded, so removing the referencing rows first leaves nothing to null.
  delete from public.pet_medications where user_id = p_user_id;
  delete from public.pet_health_items where user_id = p_user_id;
  delete from public.pet_health_events where user_id = p_user_id;
  -- Documents (DOC-1) after the record that will point at them: a later link
  -- from a record to its document is ON DELETE SET NULL, and deleting the
  -- document first would null it with an UPDATE that refuse_late_writes
  -- refuses. Files before documents, both before the pets they belong to.
  delete from public.pet_document_files where user_id = p_user_id;
  delete from public.pet_documents where user_id = p_user_id;
  delete from public.symptom_checks where user_id = p_user_id;
  delete from public.pets where user_id = p_user_id;
  -- user_feedback goes with the profile by cascade.
  delete from public.profiles where id = p_user_id;
end;
$$;
