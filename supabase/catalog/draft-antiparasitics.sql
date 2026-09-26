-- DRAFT antiparasitics from docs/design/medical-record-spec.md §5.4.
--
-- NOT VERIFIED. Compositions and intervals have not been checked by a vet.
-- Where the spec gives a range, the lower end is used. Load into local and
-- test stacks only:
--   docker exec -i supabase_db_kotdok psql -U postgres < supabase/catalog/draft-antiparasitics.sql
-- Rows stay `verified = false`; production shows only verified products.

insert into public.health_products (kind, name, manufacturer, aliases, species, form, targets, interval_value, interval_unit, popularity, verified)
values
  ('antiparasitic', 'Бравекто', 'MSD', array['Bravecto'], array['dog'], 'tablet', array['fleas', 'ticks'], 12, 'week', 1, false),
  ('antiparasitic', 'Бравекто Спот-он', 'MSD', array['Bravecto Spot-on'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 12, 'week', 2, false),
  ('antiparasitic', 'Бравекто Плюс', 'MSD', array['Bravecto Plus'], array['cat'], 'drops', array['fleas', 'ticks', 'worms'], 8, 'week', 3, false),
  ('antiparasitic', 'Нексгард', 'Boehringer Ingelheim', array['NexGard'], array['dog'], 'tablet', array['fleas', 'ticks'], 1, 'month', 3, false),
  ('antiparasitic', 'Нексгард Спектра', 'Boehringer Ingelheim', array['NexGard Spectra'], array['dog'], 'tablet', array['fleas', 'ticks', 'worms', 'heartworm'], 1, 'month', 4, false),
  ('antiparasitic', 'Нексгард Комбо', 'Boehringer Ingelheim', array['NexGard Combo'], array['cat'], 'drops', array['fleas', 'ticks', 'worms'], 1, 'month', 4, false),
  ('antiparasitic', 'Симпарика', 'Zoetis', array['Simparica'], array['dog'], 'tablet', array['fleas', 'ticks'], 1, 'month', 5, false),
  ('antiparasitic', 'Симпарика Трио', 'Zoetis', array['Simparica Trio'], array['dog'], 'tablet', array['fleas', 'ticks', 'worms', 'heartworm'], 1, 'month', null, false),
  ('antiparasitic', 'Стронгхолд', 'Zoetis', array['Stronghold'], array['cat', 'dog'], 'drops', array['fleas', 'worms', 'ear_mites'], 1, 'month', 6, false),
  ('antiparasitic', 'Стронгхолд Плюс', 'Zoetis', array['Stronghold Plus'], array['cat'], 'drops', array['fleas', 'ticks', 'worms'], 1, 'month', null, false),
  ('antiparasitic', 'Адвокат', 'Elanco', array['Advocate'], array['cat', 'dog'], 'drops', array['fleas', 'worms'], 1, 'month', null, false),
  ('antiparasitic', 'Фронтлайн Комбо', 'Boehringer Ingelheim', array['Frontline Combo'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 1, 'month', 7, false),
  ('antiparasitic', 'Инспектор', 'Экопром', array['Inspector'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'worms'], 1, 'month', 8, false),
  ('antiparasitic', 'Форесто', 'Elanco', array['Seresto', 'Foresto'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 7, 'month', null, false),
  ('antiparasitic', 'Мильбемакс', 'Elanco', array['Milbemax'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', 9, false),
  ('antiparasitic', 'Дронтал', 'Elanco', array['Drontal'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', 10, false),
  ('antiparasitic', 'Празицид', 'Api-San', array['Prazicid'], array['cat', 'dog'], 'suspension', array['worms'], 3, 'month', 11, false),
  ('antiparasitic', 'Профендер', 'Elanco', array['Profender'], array['cat'], 'drops', array['worms'], 3, 'month', null, false)
on conflict (kind, lower(name)) do update
  set manufacturer = excluded.manufacturer, aliases = excluded.aliases, species = excluded.species, form = excluded.form,
      targets = excluded.targets, interval_value = excluded.interval_value, interval_unit = excluded.interval_unit,
      popularity = excluded.popularity, updated_at = now();
