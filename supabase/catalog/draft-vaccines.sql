-- DRAFT vaccines from docs/design/medical-record-spec.md §5.4.
--
-- NOT VERIFIED. Compositions and intervals have not been checked by a vet.
-- Load into local and test stacks only:
--   docker exec -i supabase_db_kotdok psql -U postgres < supabase/catalog/draft-vaccines.sql
-- Rows stay `verified = false`; production shows only verified products.

insert into public.health_products (kind, name, manufacturer, aliases, species, form, targets, interval_value, interval_unit, popularity, verified)
values
  ('vaccine', 'Нобивак Tricat Trio', 'MSD', array['Nobivac Tricat Trio'], array['cat'], 'injection', array['panleukopenia', 'calicivirus', 'rhinotracheitis'], 1, 'year', 1, false),
  ('vaccine', 'Нобивак Rabies', 'MSD', array['Nobivac Rabies'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', 2, false),
  ('vaccine', 'Пуревакс RCP', 'Boehringer Ingelheim', array['Purevax RCP'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia'], 1, 'year', 3, false),
  ('vaccine', 'Пуревакс RCPCh', 'Boehringer Ingelheim', array['Purevax RCPCh'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia', 'chlamydia'], 1, 'year', 4, false),
  ('vaccine', 'Пуревакс FeLV', 'Boehringer Ingelheim', array['Purevax FeLV'], array['cat'], 'injection', array['felv'], 1, 'year', null, false),
  ('vaccine', 'Фелоцел CVR', 'Zoetis', array['Felocell CVR'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia'], 1, 'year', 5, false),
  ('vaccine', 'Мультифел-4', 'Нарвак', array['Multifel-4'], array['cat'], 'injection', array['panleukopenia', 'calicivirus', 'rhinotracheitis', 'chlamydia'], 1, 'year', 6, false),
  ('vaccine', 'Нобивак DHPPi', 'MSD', array['Nobivac DHPPi'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza'], 1, 'year', 1, false),
  ('vaccine', 'Нобивак Puppy DP', 'MSD', array['Nobivac Puppy DP'], array['dog'], 'injection', array['distemper', 'parvovirus'], 1, 'year', null, false),
  ('vaccine', 'Нобивак L4', 'MSD', array['Nobivac L4'], array['dog'], 'injection', array['leptospirosis'], 1, 'year', 3, false),
  ('vaccine', 'Нобивак KC', 'MSD', array['Nobivac KC'], array['dog'], 'intranasal', array['bordetella', 'parainfluenza'], 1, 'year', null, false),
  ('vaccine', 'Эурикан DHPPi2-LR', 'Boehringer Ingelheim', array['Eurican DHPPi2-LR'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis', 'rabies'], 1, 'year', 4, false),
  ('vaccine', 'Вангард Плюс 5 L4', 'Zoetis', array['Vanguard Plus 5 L4'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis'], 1, 'year', 5, false),
  ('vaccine', 'Мультикан-8', 'Ветбиохим', array['Multikan-8'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'coronavirus', 'leptospirosis', 'rabies'], 1, 'year', 6, false),
  ('vaccine', 'Рабикан', 'Щёлковский биокомбинат', array['Rabikan'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', null, false),
  ('vaccine', 'Дефенсор 3', 'Zoetis', array['Defensor 3'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', null, false)
on conflict (kind, lower(name)) do update
  set manufacturer = excluded.manufacturer, aliases = excluded.aliases, species = excluded.species, form = excluded.form,
      targets = excluded.targets, interval_value = excluded.interval_value, interval_unit = excluded.interval_unit,
      popularity = excluded.popularity, updated_at = now();
