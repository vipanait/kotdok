-- Medication reminders and «дали» (FB-5).
--
-- The owner's decision of 20 October 2026 changes the record spec §7.12: a
-- course may carry the times it is given at, the phone reminds at them while
-- the course runs, and a dose can be marked as given. The times and the dose
-- are the owner's; the app suggests neither.

-- Up to four «HH:MM» on the phone's own clock.
alter table public.pet_medications
  add column if not exists reminder_times text[] not null default '{}';

alter table public.pet_medications
  drop constraint if exists pet_medications_reminder_times_check,
  add constraint pet_medications_reminder_times_check check (
    cardinality(reminder_times) <= 4
    and array_to_string(reminder_times, ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9](,|$))*$'
  );

-- One row per dose given: the course, the owner's day, the time it was for.
create table if not exists public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  -- Cascading from the account: deletion's auth step takes the journal with it.
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  medication_id uuid not null references public.pet_medications(id) on delete cascade,
  taken_on date not null,
  slot text not null check (slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_at timestamptz not null default now(),
  -- A second «дали» for the same dose — a double tap, another phone — is the same dose.
  unique (medication_id, taken_on, slot)
);

create index if not exists medication_doses_pet_day on public.medication_doses (pet_id, taken_on);

-- Only the server reaches it, as every record table.
alter table public.medication_doses enable row level security;

-- Courses and pets are deleted softly; their doses go for real, whichever
-- path deleted them (the course screen, the pet form's list, the pet).
create or replace function public.drop_doses_of_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'pet_medications' then
    delete from public.medication_doses where medication_id = new.id;
  else
    delete from public.medication_doses where pet_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.drop_doses_of_deleted() from public, anon, authenticated;

drop trigger if exists pet_medications_drop_doses on public.pet_medications;
create trigger pet_medications_drop_doses
  after update of deleted_at on public.pet_medications
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.drop_doses_of_deleted();

drop trigger if exists pets_drop_doses on public.pets;
create trigger pets_drop_doses
  after update of deleted_at on public.pets
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.drop_doses_of_deleted();
