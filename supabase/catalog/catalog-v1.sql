-- Catalogue v1: vaccines and antiparasitics for cats and dogs sold in Russia.
--
-- Sources checked on 2026-10-04: Russian product instructions (vidal.ru/veterinar,
-- vetlek.ru, vetsnab.info, vettorg.ru), manufacturers' Russian sites (msd-animal-health.ru,
-- mypetandi.elanco.com/ru, vetbio.ru, avzvet.ru, neoterica.ru, apicenna.ru, bioveta.cz/ru,
-- vepripak.ru, promomed.pro), Rosselkhoznadzor notices and 2025–2026 market reviews
-- (zooinform.ru, vetandlife.ru, kommersant.ru).
--
-- Compiled from public instructions WITHOUT a vet's review. The owner chose to publish it
-- as verified (spec §5.4 asked for a vet check first); rows will be pruned later.
--
-- Intervals are «по инструкции препарата»; where an instruction gives a range, the lower
-- end is used (spec §5.4). Deliberate exception: every rabies-containing vaccine gets
-- 1 year, although the Russian instructions of Нобивак Rabies, Дефенсор 3, Рабифел and
-- Рабикс allow 3 years and Рабикан 2 years — spec §5.4 («в России бешенство — ежегодно»)
-- and clinic practice are annual. Нобивак Puppy DP has no interval: the next dose is a
-- different vaccine.
--
-- Supply notes: MSD stopped official Nobivac deliveries in 2022 and Boehringer cut Eurican
-- and Purevax; they stay in the list because owners have them in their passports and they
-- still reach shops. Simparica Trio is sold online but its Russian registration was not
-- confirmed.
--
-- Safe to run more than once: the unique index health_products_name_kind (kind, lower(name))
-- makes a repeat run rewrite the same rows. Load:
--   psql "$DATABASE_URL" -f supabase/catalog/catalog-v1.sql

insert into public.health_products (kind, name, manufacturer, aliases, species, form, targets, interval_value, interval_unit, popularity, verified)
values
  -- Vaccines: cats
  ('vaccine', 'Нобивак Tricat Trio', 'MSD Animal Health', array['Nobivac Tricat Trio', 'Нобивак Трикет Трио', 'Нобивак Трикет', 'Nobivac Tricat'], array['cat'], 'injection', array['panleukopenia', 'calicivirus', 'rhinotracheitis'], 1, 'year', 1, true),
  ('vaccine', 'Нобивак Ducat', 'MSD Animal Health', array['Nobivac Ducat', 'Нобивак Дукат'], array['cat'], 'injection', array['calicivirus', 'rhinotracheitis'], 1, 'year', null, true),
  ('vaccine', 'Пуревакс RCP', 'Boehringer Ingelheim', array['Purevax RCP', 'Пюрвакс RCP', 'Пуревакс РЦП'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia'], 1, 'year', 6, true),
  ('vaccine', 'Пуревакс RCPCh', 'Boehringer Ingelheim', array['Purevax RCPCh', 'Пюрвакс RCPCh', 'Пуревакс РЦПЧ'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia', 'chlamydia'], 1, 'year', 4, true),
  ('vaccine', 'Пуревакс FeLV', 'Boehringer Ingelheim', array['Purevax FeLV', 'Пюрвакс FeLV'], array['cat'], 'injection', array['felv'], 1, 'year', null, true),
  ('vaccine', 'Фелоцел CVR', 'Zoetis', array['Felocell CVR', 'Фелоцелл CVR', 'Фелоцел'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia'], 1, 'year', 7, true),
  ('vaccine', 'Мультифел', 'Ветбиохим', array['Мультифел-4', 'Мультифел 4', 'Multifel', 'Multifel-4'], array['cat'], 'injection', array['panleukopenia', 'rhinotracheitis', 'calicivirus'], 1, 'year', 3, true),
  ('vaccine', 'Биофел PCH', 'Bioveta', array['Biofel PCH', 'Биофел'], array['cat'], 'injection', array['panleukopenia', 'calicivirus', 'rhinotracheitis'], 1, 'year', 5, true),
  ('vaccine', 'Биофел PCHR', 'Bioveta', array['Biofel PCHR'], array['cat'], 'injection', array['panleukopenia', 'calicivirus', 'rhinotracheitis', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Карнифел PCHR', 'ФГБУ «ВНИИЗЖ»', array['Karnifel PCHR', 'Карнифел'], array['cat'], 'injection', array['panleukopenia', 'calicivirus', 'rhinotracheitis', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Леоминор', 'Ветбиохим', array['Leominor'], array['cat'], 'injection', array['felv'], 1, 'year', null, true),
  ('vaccine', 'Рабифел', 'Ветбиохим', array['Rabifel'], array['cat'], 'injection', array['rabies'], 1, 'year', null, true),

  -- Vaccines: dogs
  ('vaccine', 'Нобивак DHPPi', 'MSD Animal Health', array['Nobivac DHPPi', 'Нобивак ДХППи', 'Нобивак DHPPI'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza'], 1, 'year', 1, true),
  ('vaccine', 'Нобивак Puppy DP', 'MSD Animal Health', array['Nobivac Puppy DP', 'Нобивак Паппи DP', 'Нобивак Паппи'], array['dog'], 'injection', array['distemper', 'parvovirus'], null, null, null, true),
  ('vaccine', 'Нобивак L4', 'MSD Animal Health', array['Nobivac L4', 'Нобивак Л4'], array['dog'], 'injection', array['leptospirosis'], 1, 'year', 3, true),
  ('vaccine', 'Нобивак RL', 'MSD Animal Health', array['Nobivac RL'], array['dog'], 'injection', array['rabies', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Нобивак KC', 'MSD Animal Health', array['Nobivac KC', 'Нобивак КС'], array['dog'], 'intranasal', array['bordetella', 'parainfluenza'], 1, 'year', null, true),
  ('vaccine', 'Эурикан DHPPI2-L', 'Boehringer Ingelheim', array['Eurican DHPPi2-L', 'Эурикан DHPPi+L', 'Эурикан'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Эурикан DHPPI2-LR', 'Boehringer Ingelheim', array['Eurican DHPPi2-LR', 'Эурикан DHPPi+LR'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis', 'rabies'], 1, 'year', 6, true),
  ('vaccine', 'Вангард Плюс 5 L4 CV', 'Zoetis', array['Vanguard Plus 5 L4 CV', 'Вангард Плюс 5 L4', 'Вангард 5 L4 CV'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'coronavirus', 'leptospirosis'], 1, 'year', 7, true),
  ('vaccine', 'Вангард 7', 'Zoetis', array['Vanguard 7', 'Вангард'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Мультикан-6', 'Ветбиохим', array['Multikan-6', 'Мультикан 6'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'coronavirus', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Мультикан-8', 'Ветбиохим', array['Multikan-8', 'Мультикан 8'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'coronavirus', 'leptospirosis', 'rabies'], 1, 'year', 4, true),
  ('vaccine', 'Астерион DHPPiL', 'Ветбиохим', array['Asterion DHPPiL', 'Астерион'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Астерион DHPPiLR', 'Ветбиохим', array['Asterion DHPPiLR'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Биокан DHPPi+L', 'Bioveta', array['Biocan DHPPi+L', 'Биокан'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Биокан DHPPi+LR', 'Bioveta', array['Biocan DHPPi+LR'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis', 'rabies'], 1, 'year', 5, true),
  ('vaccine', 'Биокан Новел DHPPi/L4R', 'Bioveta', array['Biocan Novel DHPPi/L4R', 'Биокан Новел'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'parainfluenza', 'leptospirosis', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Рабикс', 'Ветбиохим', array['Rabiks', 'Rabix'], array['dog'], 'injection', array['rabies'], 1, 'year', null, true),

  -- Vaccines: cats and dogs (rabies)
  ('vaccine', 'Нобивак Rabies', 'MSD Animal Health', array['Nobivac Rabies', 'Нобивак Рабиес', 'Нобивак Рабис'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', 2, true),
  ('vaccine', 'Рабикан', 'Щёлковский биокомбинат', array['Rabikan', 'Щелково-51'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', null, true),
  ('vaccine', 'Дефенсор 3', 'Zoetis', array['Defensor 3', 'Дефенсор-3', 'Дефенсор'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', null, true),
  ('vaccine', 'Рабизин', 'Boehringer Ingelheim', array['Rabisin', 'Рабизен'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', null, true),

  -- Antiparasitics: dogs
  ('antiparasitic', 'Симпарика', 'Zoetis', array['Simparica', 'Симпарико'], array['dog'], 'tablet', array['fleas', 'ticks'], 1, 'month', 1, true),
  ('antiparasitic', 'Симпарика Трио', 'Zoetis', array['Simparica Trio'], array['dog'], 'tablet', array['fleas', 'ticks', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Бравекто', 'MSD Animal Health', array['Bravecto', 'Бравекто таблетки', 'Бравекто жевательные'], array['dog'], 'tablet', array['fleas', 'ticks'], 12, 'week', 3, true),
  ('antiparasitic', 'Тиксфли', 'Ветфармстандарт', array['Tiksfli', 'Tixfly', 'Тиксфлай'], array['dog'], 'tablet', array['fleas', 'ticks'], 12, 'week', 7, true),
  ('antiparasitic', 'Рабектра', 'Промомед', array['Rabektra', 'Рабектро'], array['dog'], 'tablet', array['fleas', 'ticks'], 12, 'week', null, true),
  ('antiparasitic', 'Веприпак', 'Ветстем', array['Vepripak'], array['dog'], 'tablet', array['fleas', 'ticks'], 12, 'week', null, true),
  ('antiparasitic', 'Фронтлайн НексгарД', 'Boehringer Ingelheim', array['NexGard', 'Нексгард', 'Некстгард', 'Frontline NexGard'], array['dog'], 'tablet', array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'НексгарД Спектра', 'Boehringer Ingelheim', array['NexGard Spectra', 'Нексгард Спектра'], array['dog'], 'tablet', array['fleas', 'ticks', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Оквет ЭкспрессТабс', 'Агроветзащита', array['OKVET ExpressTabs', 'Оквет', 'Okvet'], array['dog'], 'tablet', array['fleas', 'ticks', 'worms'], 6, 'week', null, true),
  ('antiparasitic', 'Адвантикс', 'Elanco', array['Advantix', 'K9 Advantix'], array['dog'], 'drops', array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Атакса', 'KRKA', array['Ataxxa', 'Ataxa'], array['dog'], 'drops', array['fleas', 'ticks'], 4, 'week', null, true),
  ('antiparasitic', 'Дронтал плюс', 'Elanco', array['Drontal Plus', 'Дронтал+'], array['dog'], 'tablet', array['worms'], 3, 'month', null, true),

  -- Antiparasitics: cats
  ('antiparasitic', 'Бравекто Плюс', 'MSD Animal Health', array['Bravecto Plus'], array['cat'], 'drops', array['fleas', 'ticks', 'ear_mites', 'worms', 'heartworm'], 12, 'week', 3, true),
  ('antiparasitic', 'Бродлайн', 'Boehringer Ingelheim', array['Broadline', 'Бродлайн Спот-он', 'Броадлайн'], array['cat'], 'drops', array['fleas', 'ticks', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Профендер', 'Elanco', array['Profender'], array['cat'], 'drops', array['worms'], 3, 'month', 7, true),
  ('antiparasitic', 'Дронтал', 'Elanco', array['Drontal'], array['cat'], 'tablet', array['worms'], 3, 'month', null, true),

  -- Antiparasitics: cats and dogs
  ('antiparasitic', 'Бравекто Спот Он', 'MSD Animal Health', array['Bravecto Spot-on', 'Бравекто Спот-он', 'Бравекто капли'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 12, 'week', null, true),
  ('antiparasitic', 'Стронгхолд', 'Zoetis', array['Stronghold', 'Revolution'], array['cat', 'dog'], 'drops', array['fleas', 'ear_mites', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Селафорт', 'KRKA', array['Selafort', 'Селафорд'], array['cat', 'dog'], 'drops', array['fleas', 'ear_mites', 'worms', 'heartworm'], 1, 'month', 4, true),
  ('antiparasitic', 'Адвокат', 'Elanco', array['Advocate', 'Адвокад'], array['cat', 'dog'], 'drops', array['fleas', 'ear_mites', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Фронтлайн Комбо', 'Boehringer Ingelheim', array['Frontline Combo', 'Фронтлайн'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 4, 'week', null, true),
  ('antiparasitic', 'Фронтлайн Спрей', 'Boehringer Ingelheim', array['Frontline Spray'], array['cat', 'dog'], null, array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Фиприст Комбо', 'KRKA', array['Fypryst Combo', 'Фиприст'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 4, 'week', null, true),
  ('antiparasitic', 'Инспектор Тотал', 'Экопром', array['Inspector Total', 'Инспектор Тотал С', 'Инспектор Тотал К', 'Инспектор'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites', 'worms', 'heartworm'], 4, 'week', 5, true),
  ('antiparasitic', 'Инспектор Квадро', 'Экопром', array['Inspector Quadro', 'Инспектор Квадро С', 'Инспектор Квадро К'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites', 'worms', 'heartworm'], 4, 'week', null, true),
  ('antiparasitic', 'Барс Форте', 'Агроветзащита', array['Bars Forte', 'Барс капли', 'Барс'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 1, 'month', 8, true),
  ('antiparasitic', 'Барс ошейник', 'Агроветзащита', array['Bars collar', 'Ошейник Барс'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 4, 'month', null, true),
  ('antiparasitic', 'Рольф Клуб 3D', 'Экопром', array['Rolf Club 3D', 'Рольф Клаб 3Д', 'Рольф'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Рольф Клуб 3D ошейник', 'Экопром', array['Rolf Club 3D collar', 'Ошейник Рольф'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 6, 'month', null, true),
  ('antiparasitic', 'Форесто', 'Elanco', array['Foresto', 'Seresto', 'Сересто', 'Ошейник Форесто'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 7, 'month', null, true),
  ('antiparasitic', 'Мильбемакс', 'Elanco', array['Milbemax', 'Милбемакс'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', 2, true),
  ('antiparasitic', 'Милпразон', 'KRKA', array['Milprazon', 'Мильпразон'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', 6, true),
  ('antiparasitic', 'Празител', 'Астрафарм', array['Prazitel', 'Празитель'], array['cat', 'dog'], 'suspension', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Празицид', 'Апиценна', array['Prazicid', 'Празицид-суспензия Плюс', 'Празицид Плюс'], array['cat', 'dog'], 'suspension', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Дирофен', 'Апиценна', array['Dirofen', 'Дирофен Плюс'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Каниквантел Плюс', 'Euracon Pharma', array['Caniquantel Plus', 'Каниквантел'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true)
on conflict (kind, lower(name)) do update
  set name = excluded.name, manufacturer = excluded.manufacturer, aliases = excluded.aliases, species = excluded.species,
      form = excluded.form, targets = excluded.targets, interval_value = excluded.interval_value,
      interval_unit = excluded.interval_unit, popularity = excluded.popularity, verified = true, updated_at = now();
