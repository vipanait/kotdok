-- Allow a new urgency value 'healthy' (nothing to do, cat is fine).
-- Drops any existing CHECK constraint on symptom_checks.urgency and recreates it
-- with the expanded value set. Safe to run even if no constraint existed.

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'symptom_checks'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%urgency%';

  if conname is not null then
    execute format('alter table public.symptom_checks drop constraint %I', conname);
  end if;
end $$;

alter table public.symptom_checks
  add constraint symptom_checks_urgency_check
  check (urgency in ('emergency', 'urgent', 'monitor', 'home_care', 'healthy'));
