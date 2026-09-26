-- Parasite treatments in the medical record (MR-05).
--
-- The same records, plans and «Сделано» as vaccinations, with their own kind:
-- one system of dates and repeats, not a second one. A combined product
-- (fleas, ticks and worms at once) is one item, shown under each group it
-- covers — never two items, never two reminders.

alter table public.pet_health_events drop constraint if exists pet_health_events_kind_check;
alter table public.pet_health_events add constraint pet_health_events_kind_check
  check (kind in ('vaccination', 'parasite'));
