-- Dog-only profile fields for triage context (size → GDV/ortho/brachy; walk → heat/exertion/injury).
-- For cats these stay null; app layer clears them when species !== 'dog'.

alter table public.pets
  add column if not exists size_class text,
  add column if not exists walk_activity text;

alter table public.pets
  drop constraint if exists pets_size_class_check;

alter table public.pets
  add constraint pets_size_class_check
  check (size_class is null or size_class in ('toy', 'small', 'medium', 'large', 'giant'));

alter table public.pets
  drop constraint if exists pets_walk_activity_check;

alter table public.pets
  add constraint pets_walk_activity_check
  check (walk_activity is null or walk_activity in ('rare', 'daily_short', 'daily_long', 'sport'));
