-- The latest check of each of an owner's pets, for the pet rows of the site.
--
-- The rows used to be found by reading the owner's fifty newest checks and
-- keeping the first seen per pet: with several pets, a pet checked rarely
-- fell out of the window once the others had been checked fifty times, and
-- its row lost the line it had. One DISTINCT ON in the database finds every
-- pet's newest check whatever the counts are.

create or replace function public.latest_checks_by_pet(p_user_id uuid)
returns table (pet_id uuid, urgency text, created_at timestamp)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (c.pet_id) c.pet_id, c.urgency, c.created_at
  from public.symptom_checks c
  where c.user_id = p_user_id
    and c.pet_id is not null
    and c.deleted_at is null
  order by c.pet_id, c.created_at desc, c.id desc
$$;

-- Only a trusted server asks, for the owner it has verified.
revoke all on function public.latest_checks_by_pet(uuid) from public, anon, authenticated;
grant execute on function public.latest_checks_by_pet(uuid) to service_role;

-- The read above, without a sort: one owner's live checks by pet, newest first.
create index if not exists symptom_checks_pet_latest_idx
  on public.symptom_checks (user_id, pet_id, created_at desc)
  where deleted_at is null and pet_id is not null;
