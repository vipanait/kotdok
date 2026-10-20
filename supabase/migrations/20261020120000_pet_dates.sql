-- A pet's birth date and the day it came home (FB-2/01).
--
-- `birth_date` may be the owner's estimate: a shelter cat has no papers, and
-- «about four and a half» is stored as the day four and a half years before
-- the form was saved, so the age keeps growing. `birth_date_approx` marks such
-- a day: the app does not congratulate on it. `age_years` stays for pets
-- without a birth date and for clients that do not know the dates yet.
--
-- `adopted_on` is the first day together, for «вместе N дней».

alter table public.pets
  add column if not exists birth_date date,
  add column if not exists birth_date_approx boolean not null default false,
  add column if not exists adopted_on date;

alter table public.pets
  drop constraint if exists pets_dates_order,
  add constraint pets_dates_order check (adopted_on is null or birth_date is null or adopted_on >= birth_date),
  drop constraint if exists pets_birth_date_approx_needs_date,
  add constraint pets_birth_date_approx_needs_date check (birth_date is not null or not birth_date_approx);
