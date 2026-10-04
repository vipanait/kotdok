-- Catalogue v2: more vaccines and antiparasitics for cats and dogs sold in Russia.
-- Compiled 2026-10-04. Run AFTER catalog-v1.sql: this file holds only the new rows
-- plus two corrections to v1 rows (marked below), all as upserts.
--
-- Sources checked on 2026-10-04: Russian product instructions and registry entries
-- (vidal.ru/veterinar, vetsnab.info, vetlek.ru, vettorg.ru, galen.vetrf.ru), manufacturers'
-- Russian sites (vetbio.ru, shop.arriah.ru, fsvps.gov.ru news, biocentr.ru, vzcfarm.ru,
-- msd-animal-health.ru, bioveta.cz/ru, avzvet.ru, apicenna.ru, neoterica.ru,
-- mypetandi.elanco.com/ru, ceva-russia.ru, krka.ru, astrafarm.com, pets.nita-farm.ru,
-- agrobioprom.ru, valta.ru) and 2024–2026 retail listings and market reviews
-- (4lapy.ru, magizoo.ru, vetapteka1.ru, petdog.ru, vetandlife.ru, zoomedvet.ru).
--
-- Compiled from public instructions WITHOUT a vet's review. The owner chose to publish it
-- as verified, like v1; rows will be pruned later.
--
-- Conventions are v1's: intervals are «по инструкции препарата», the lower end of any range;
-- every rabies-containing vaccine gets 1 year; dewormers take the routine prophylactic
-- «ежеквартально» (3 months) even where the instruction adds monthly in-season
-- dirofilariasis prevention; puppy-only vaccines whose next dose is a different vaccine have
-- no interval. Ear-mite treatments (Отодектин, Акаромектин, Барс капли ушные, Отоферонол
-- Голд, Декта Форте, Амитразин, Ивермек-спрей) carry the instruction's repeat of the course
-- in days, not a preventive interval. Sprays have no form code, so form is null.
--
-- Supply notes: since 1 May 2025 no foreign dog or cat vaccines reach Russia
-- (Rosselkhoznadzor). Imported vaccines below (Nobivac, Purevax, Canigen, Feligen,
-- Duramune, Felocell, Leukocell, Quadricat, Biocan) stay because owners have them in their
-- passports. Квадрикат lost its registration in 2021, Скалибор and Вектра 3D are being
-- withdrawn; kept for the same reason.
--
-- Safe to run more than once: the unique index health_products_name_kind (kind, lower(name))
-- makes a repeat run rewrite the same rows. Load:
--   psql "$DATABASE_URL" -f supabase/catalog/catalog-v1.sql
--   psql "$DATABASE_URL" -f supabase/catalog/catalog-v2.sql

insert into public.health_products (kind, name, manufacturer, aliases, species, form, targets, interval_value, interval_unit, popularity, verified)
values
  -- Corrections to v1 rows
  -- The dog and cat drops differ in composition; the cat drops get their own row below.
  ('antiparasitic', 'Рольф Клуб 3D', 'Экопром', array['Rolf Club 3D', 'Рольф Клаб 3Д', 'Рольф', 'Рольф Клуб 3D капли для собак'], array['dog'], 'drops', array['fleas', 'ticks'], 1, 'month', null, true),
  -- «Барс капли» is a different АВЗ product (row below), no longer an alias of Барс Форте.
  ('antiparasitic', 'Барс Форте', 'Агроветзащита', array['Bars Forte', 'Барс Форте капли', 'Барс форте'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 1, 'month', 8, true),

  -- Vaccines: cats
  ('vaccine', 'Фелиген CRP', 'Virbac', array['Feligen CRP', 'Фелижен CRP', 'Фелиген СРП', 'Фелиген'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia'], 1, 'year', null, true),
  ('vaccine', 'Фелиген CRP/R', 'Virbac', array['Feligen CRP/R', 'Фелижен CRP/R', 'Фелиген CRP R'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Пуревакс RCP Rabies', 'Boehringer Ingelheim', array['Purevax RCP Rabies', 'Пуревакс RCP Рабиес', 'Пюрвакс RCP Rabies'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Пуревакс RCPCh Rabies', 'Boehringer Ingelheim', array['Purevax RCPCh Rabies', 'Пуревакс RCPCh Рабиес', 'Пюрвакс RCPCh Rabies'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia', 'chlamydia', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Фелоцел 4', 'Zoetis', array['Felocell 4', 'Фелоцел-4', 'Фелоцелл 4'], array['cat'], 'injection', array['rhinotracheitis', 'calicivirus', 'panleukopenia', 'chlamydia'], 1, 'year', null, true),
  ('vaccine', 'Лейкоцел 2', 'Zoetis', array['Leukocell 2', 'Леукоцел 2', 'Лейкоцел'], array['cat'], 'injection', array['felv'], 1, 'year', null, true),
  ('vaccine', 'Квадрикат', 'Boehringer Ingelheim', array['Quadricat', 'Квадрикет', 'Квадрикэт'], array['cat'], 'injection', array['panleukopenia', 'calicivirus', 'rhinotracheitis', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Карнифел PCH', 'ФГБУ «ВНИИЗЖ»', array['Karnifel PCH', 'Карнифел РСН', 'Карнифел PCH без бешенства'], array['cat'], 'injection', array['panleukopenia', 'calicivirus', 'rhinotracheitis'], 1, 'year', null, true),

  -- Vaccines: dogs
  ('vaccine', 'Мультикан-4', 'Ветбиохим', array['Multikan-4', 'Multican-4', 'Мультикан 4', 'Мультикан4'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus', 'coronavirus'], 1, 'year', 8, true),
  ('vaccine', 'Карникан-5R', 'ФГБУ «ВНИИЗЖ»', array['Karnikan-5R', 'Карникан-5Р', 'Карникан 5R', 'Карникан-5', 'Карникан'], array['dog'], 'injection', array['distemper', 'parvovirus', 'coronavirus', 'adenovirus', 'rabies'], 1, 'year', 9, true),
  ('vaccine', 'Карникан-4', 'ФГБУ «ВНИИЗЖ»', array['Karnikan-4', 'Карникан 4'], array['dog'], 'injection', array['distemper', 'parvovirus', 'coronavirus', 'adenovirus'], 1, 'year', null, true),
  ('vaccine', 'Карникан Puppy DP', 'ФГБУ «ВНИИЗЖ»', array['Karnikan Puppy DP', 'Карникан Паппи', 'Карникан Puppy'], array['dog'], 'injection', array['distemper', 'parvovirus'], null, null, null, true),
  ('vaccine', 'Дипентавак', 'Ветзвероцентр', array['Dipentavac', 'Дипентовак'], array['dog'], 'injection', array['distemper', 'parvovirus', 'adenovirus', 'leptospirosis', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Гексаканивак', 'Ветзвероцентр', array['Hexakanivac', 'Geksakanivak', 'Гексаканевак'], array['dog'], 'injection', array['distemper', 'parvovirus', 'adenovirus', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Биовак-DPAL', 'Биоцентр', array['Biovac DPAL', 'Биовак DPAL', 'Биовак ДПАЛ', 'Биовак'], array['dog'], 'injection', array['distemper', 'parvovirus', 'adenovirus', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Нобивак Lepto', 'MSD Animal Health', array['Nobivac Lepto', 'Нобивак Лепто', 'Нобивак L', 'Нобивак DHPPi+L'], array['dog'], 'injection', array['leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Нобивак DHP', 'MSD Animal Health', array['Nobivac DHP', 'Нобивак ДГП', 'Нобивак ДХП'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parvovirus'], 1, 'year', null, true),
  ('vaccine', 'Биокан Puppy', 'Bioveta', array['Biocan Puppy', 'Биокан Паппи', 'Биокан Пуппи'], array['dog'], 'injection', array['distemper', 'parvovirus'], 1, 'year', null, true),
  ('vaccine', 'Биокан LR', 'Bioveta', array['Biocan LR', 'Биокан ЛР'], array['dog'], 'injection', array['leptospirosis', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Каниген DHA2PPi/L', 'Virbac', array['Canigen DHA2PPi/L', 'Canigen DHPPi/L', 'Каниген DHPPi/L', 'Канижен DHPPi/L', 'Каниген'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parainfluenza', 'parvovirus', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Каниген DHA2PPi/LR', 'Virbac', array['Canigen DHA2PPi/LR', 'Canigen DHPPi/LR', 'Каниген DHPPi/LR', 'Канижен DHPPi/LR'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parainfluenza', 'parvovirus', 'leptospirosis', 'rabies'], 1, 'year', null, true),
  ('vaccine', 'Эурикан Primo', 'Boehringer Ingelheim', array['Eurican Primo', 'Эурикан Примо'], array['dog'], 'injection', array['parvovirus'], null, null, null, true),
  ('vaccine', 'Дюрамун Макс 5/4L', 'Zoetis', array['Duramune Max 5/4L', 'Дюрамун 5/4L', 'Дюрамун'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parainfluenza', 'parvovirus', 'leptospirosis'], 1, 'year', null, true),
  ('vaccine', 'Дюрамун Макс 5-CvK/4L', 'Zoetis', array['Duramune Max 5-CvK/4L', 'Дюрамун 5-CvK/4L'], array['dog'], 'injection', array['distemper', 'adenovirus', 'parainfluenza', 'parvovirus', 'coronavirus', 'leptospirosis'], 1, 'year', null, true),

  -- Vaccines: cats and dogs (rabies)
  ('vaccine', 'Рабиген Моно', 'Virbac', array['Rabigen Mono', 'Рабиген', 'Rabigen'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', null, true),
  ('vaccine', 'АРРИАХ-Рабивак', 'ФГБУ «ВНИИЗЖ»', array['ARRIAH-Rabivak', 'Арриах-Рабивак', 'Рабивак'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', null, true),
  ('vaccine', 'Биокан R', 'Bioveta', array['Biocan R', 'Биокан Р'], array['cat', 'dog'], 'injection', array['rabies'], 1, 'year', null, true),

  -- Antiparasitics: dogs
  ('antiparasitic', 'Фронтлайн Три-Акт', 'Boehringer Ingelheim', array['Frontline Tri-Act', 'Фронтлайн Триакт', 'Фронтлайн Три Акт'], array['dog'], 'drops', array['fleas', 'ticks'], 4, 'week', null, true),
  ('antiparasitic', 'Эффитикс', 'Virbac', array['Effitix', 'Эфитикс', 'Эффитикс спот-он'], array['dog'], 'drops', array['fleas', 'ticks'], 4, 'week', null, true),
  ('antiparasitic', 'Вектра 3D', 'Ceva', array['Vectra 3D', 'Вектра', 'Вектор 3D'], array['dog'], 'drops', array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Гельминтал С', 'Экопром', array['Gelmintal spot-on dog', 'Гельминтал капли для собак', 'Гельминтал Спот-он для собак'], array['dog'], 'drops', array['fleas', 'ear_mites', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Килтикс', 'Elanco', array['Kiltix', 'Килтикс ошейник', 'Kiltix collar'], array['dog'], 'collar', array['fleas', 'ticks'], 6, 'month', null, true),
  ('antiparasitic', 'Скалибор', 'MSD Animal Health', array['Scalibor', 'Скалибор ошейник', 'Скалибур'], array['dog'], 'collar', array['fleas', 'ticks'], 4, 'month', null, true),
  ('antiparasitic', 'Флувекто', 'Агроветзащита', array['Fluvecto', 'Флувекто жевательные таблетки', 'Флювекто'], array['dog'], 'tablet', array['fleas', 'ticks'], 12, 'week', null, true),
  ('antiparasitic', 'Ветланер', 'Рубикон', array['Vetlaner', 'Ветланер флураланер'], array['dog'], 'tablet', array['fleas', 'ticks'], 12, 'week', null, true),
  ('antiparasitic', 'Азинокс Плюс', 'Агроветзащита', array['Azinox Plus', 'Азинокс+'], array['dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Дехинел Плюс', 'KRKA', array['Dehinel Plus', 'Дехинел Плюс XL', 'Дехинель Плюс'], array['dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Цестал Плюс', 'Ceva', array['Cestal Plus', 'Цестал'], array['dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Празител Плюс', 'Астрафарм', array['Prazitel Plus', 'Празител Плюс таблетки для собак'], array['dog'], 'tablet', array['worms'], 3, 'month', null, true),

  -- Antiparasitics: cats
  ('antiparasitic', 'Рольф Клуб 3D капли для кошек', 'Экопром', array['Rolf Club 3D cat', 'РольфКлуб 3D капли для кошек', 'Рольф Клаб капли для кошек'], array['cat'], 'drops', array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Вектра Фелис', 'Ceva', array['Vectra Felis', 'Вектра Феликс'], array['cat'], 'drops', array['fleas'], 1, 'month', null, true),
  ('antiparasitic', 'Гельминтал К', 'Экопром', array['Gelmintal spot-on', 'Гельминтал капли для кошек', 'Гельминтал Спот-он для кошек'], array['cat'], 'drops', array['fleas', 'ear_mites', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Цестал Кэт', 'Ceva', array['Cestal Cat', 'Цестал Кет', 'Цестал для кошек'], array['cat'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Дехинел', 'KRKA', array['Dehinel', 'Дехинел для кошек', 'Дехинель'], array['cat'], 'tablet', array['worms'], 3, 'month', null, true),

  -- Antiparasitics: cats and dogs — drops
  ('antiparasitic', 'Барс капли', 'Агроветзащита', array['Bars', 'Барс Классик', 'Барс классик капли', 'Барс капли от блох и клещей', 'Барс инсектоакарицидные капли'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 1, 'month', 9, true),
  ('antiparasitic', 'Барс Спот-он', 'Агроветзащита', array['Bars Spot-on', 'Барс спот он', 'Барс Спотон'], array['cat', 'dog'], 'drops', array['fleas', 'ear_mites', 'worms'], 1, 'month', null, true),
  ('antiparasitic', 'MaxiDrops', 'Агроветзащита', array['MAXIDROPS', 'Максидропс', 'Макси Дропс', 'МаксиДропс'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Диронет Спот-он', 'Агроветзащита', array['Dironet Spot-on', 'Диронет спот он', 'Диронет капли'], array['cat', 'dog'], 'drops', array['fleas', 'ear_mites', 'worms'], 1, 'month', null, true),
  ('antiparasitic', 'Фронтлайн Спот Он', 'Boehringer Ingelheim', array['Frontline Spot On', 'Фронтлайн капли', 'Фронтлайн спот-он', 'Frontline'], array['cat', 'dog'], 'drops', array['fleas', 'ticks'], 4, 'week', null, true),
  ('antiparasitic', 'Фиприст Спот Он', 'KRKA', array['Fypryst Spot On', 'Fiprist', 'Фиприст капли', 'Фиприст'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 4, 'week', null, true),
  ('antiparasitic', 'Празицид-комплекс', 'Апиценна', array['Празицид-комплекс НЕО', 'Prazicid complex', 'Празицид комплекс капли', 'Празицид 3 в 1'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites', 'worms'], 1, 'month', 11, true),
  ('antiparasitic', 'Дана Ультра капли', 'Апиценна', array['Dana Ultra', 'Дана Ультра Нео', 'Дана ультра'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 1, 'month', null, true),
  ('antiparasitic', 'Дана Спот-он', 'Апиценна', array['Dana Spot-on', 'Дана спот он', 'Дана капли'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 4, 'week', null, true),
  ('antiparasitic', 'Дирофен Макс', 'Апиценна', array['Dirofen Max', 'Дирофен капли', 'Дирофен Спот-он'], array['cat', 'dog'], 'drops', array['fleas', 'ear_mites', 'worms', 'heartworm'], 1, 'month', null, true),
  ('antiparasitic', 'Инсектал капли', 'Экопром', array['Insectal', 'Инсектал', 'Инсектал Плюс'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 1, 'month', null, true),
  ('antiparasitic', 'Инсектал Комбо', 'Экопром', array['Insectal Combo', 'Инсектал Комбо К', 'Инсектал Комбо С'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites', 'worms', 'heartworm'], 4, 'week', null, true),
  ('antiparasitic', 'Инспектор Мини', 'Экопром', array['Inspector Mini', 'Инспектор Тотал Мини', 'Inspector Total Mini'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites', 'worms'], 1, 'month', null, true),
  ('antiparasitic', 'Неотерика Протекто капли', 'Экопром', array['Neoterica Protecto', 'Протекто', 'Протекто 4', 'Протеко'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 1, 'month', null, true),
  ('antiparasitic', 'Чистотел Максимум капли', 'Экопром', array['Celandine', 'Чистотел капли', 'Chistotel'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 1, 'month', null, true),
  ('antiparasitic', 'БлохНэт max', 'Астрафарм', array['BlohNet max', 'Блохнет', 'Блохнэт капли', 'Блохнет макс'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 1, 'month', null, true),
  ('antiparasitic', 'Адвантейдж', 'Elanco', array['Advantage', 'Адвантэйдж', 'Адвантаж'], array['cat', 'dog'], 'drops', array['fleas'], 4, 'week', null, true),
  ('antiparasitic', 'Фипрекс 75 спот-он', 'Vet-Agro', array['Fiprex', 'Фипрекс', 'Фипрекс капли'], array['cat', 'dog'], 'drops', array['fleas', 'ticks', 'ear_mites'], 1, 'month', null, true),

  -- Antiparasitics: cats and dogs — sprays (no form code)
  ('antiparasitic', 'Барс спрей', 'Агроветзащита', array['Bars spray', 'Барс спрей инсектоакарицидный'], array['cat', 'dog'], null, array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Барс Форте спрей', 'Агроветзащита', array['Bars Forte spray', 'Барс форте спрей'], array['cat', 'dog'], null, array['fleas', 'ticks'], 2, 'week', null, true),
  ('antiparasitic', 'Фиприст спрей', 'KRKA', array['Fypryst Spray', 'Fiprist spray'], array['cat', 'dog'], null, array['fleas', 'ticks'], 4, 'week', null, true),
  ('antiparasitic', 'Рольф Клуб 3D спрей', 'Экопром', array['Rolf Club 3D spray', 'РольфКлуб 3D спрей', 'Рольф Клаб спрей'], array['cat', 'dog'], null, array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Дана Ультра спрей', 'Апиценна', array['Dana Ultra spray', 'Дана спрей'], array['cat', 'dog'], null, array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Инспектор спрей', 'Экопром', array['Inspector spray', 'Инспектор Тотал спрей'], array['cat', 'dog'], null, array['fleas', 'ticks', 'ear_mites', 'worms'], 1, 'month', null, true),
  ('antiparasitic', 'Чистотел Максимум спрей', 'Экопром', array['Celandine spray', 'Чистотел спрей', 'Чистотел MAX спрей'], array['cat', 'dog'], null, array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Фипрекс спрей форте', 'Vet-Agro', array['Fiprex spray forte', 'Фипрекс спрей'], array['cat', 'dog'], null, array['fleas', 'ticks', 'ear_mites'], 1, 'month', null, true),

  -- Antiparasitics: cats and dogs — collars
  ('antiparasitic', 'Дана Ультра ошейник', 'Апиценна', array['Dana Ultra collar', 'Дана ошейник'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Инсектал ошейник', 'Экопром', array['Insectal collar'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 4, 'month', null, true),
  ('antiparasitic', 'Неотерика Протекто ошейник', 'Экопром', array['Neoterica Protecto collar', 'Протекто 12', 'Протекто ошейник'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 6, 'month', null, true),
  ('antiparasitic', 'Чистотел Максимум ошейник', 'Экопром', array['Celandine collar', 'Чистотел ошейник', 'Чистотел Плюс ошейник'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 3, 'month', null, true),
  ('antiparasitic', 'Больфо ошейник', 'Elanco', array['Bolfo', 'Больфо', 'Bolfo collar'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 10, 'week', null, true),
  ('antiparasitic', 'Беафар ошейник', 'Beaphar', array['Beaphar', 'Биафар', 'Бефар ошейник', 'Beaphar Flea & Tick Collar'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 6, 'month', null, true),
  ('antiparasitic', 'Доктор ZOO ошейник', 'Зооклуб', array['Doctor Zoo', 'ДокторZOO', 'Доктор Зоо'], array['cat', 'dog'], 'collar', array['fleas', 'ticks'], 2, 'month', null, true),

  -- Antiparasitics: cats and dogs — ear mites (course, not prevention)
  ('antiparasitic', 'Отодектин', 'НПО Нарвак', array['Otodectin', 'Отодектин уколы'], array['cat', 'dog'], 'injection', array['ear_mites', 'fleas', 'worms'], 8, 'day', null, true),
  ('antiparasitic', 'Акаромектин', 'Ветбиохим', array['Akaromectin', 'Акаромектин спрей'], array['cat', 'dog'], null, array['ear_mites'], 8, 'day', null, true),
  ('antiparasitic', 'Барс капли ушные', 'Агроветзащита', array['Bars ear drops', 'Барс ушные капли', 'Барс от ушного клеща'], array['cat', 'dog'], 'drops', array['ear_mites'], 5, 'day', null, true),
  ('antiparasitic', 'Отоферонол Голд', 'Топ-Вет', array['Otoferonol Gold', 'Отоферонол'], array['cat', 'dog'], 'drops', array['ear_mites'], 5, 'day', null, true),
  ('antiparasitic', 'Декта Форте', 'Апиценна', array['Dekta Forte', 'Декта', 'Декта ушные капли'], array['cat', 'dog'], 'drops', array['ear_mites'], 5, 'day', null, true),
  ('antiparasitic', 'Амитразин', 'Топ-Вет', array['Amitrazin', 'Амитразин капли ушные'], array['cat', 'dog'], 'drops', array['ear_mites'], 3, 'day', null, true),
  ('antiparasitic', 'Ивермек-спрей', 'Нита-Фарм', array['Ivermek spray', 'Ивермек спрей'], array['cat', 'dog'], null, array['ear_mites'], 3, 'day', null, true),

  -- Antiparasitics: cats and dogs — tablets and suspensions
  ('antiparasitic', 'Инспектор Квадро Табс', 'Экопром', array['Inspector Quadro Tabs', 'Инспектор Квадро таблетки', 'Инспектор табс'], array['cat', 'dog'], 'tablet', array['fleas', 'ticks', 'ear_mites', 'worms', 'heartworm'], 4, 'week', null, true),
  ('antiparasitic', 'Эктогардика', 'Агробиоснаб', array['Ektogardika', 'Ectogardica', 'Эктогардика лотиланер'], array['cat', 'dog'], 'tablet', array['fleas', 'ticks'], 1, 'month', null, true),
  ('antiparasitic', 'Диронет', 'Агроветзащита', array['Dironet', 'Диронет 200', 'Диронет 500', 'Диронет 1000', 'Диранет'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', 10, true),
  ('antiparasitic', 'Диронет суспензия', 'Агроветзащита', array['Dironet suspension', 'Диронет суспензия для кошек', 'Диронет суспензия для собак декоративных пород'], array['cat', 'dog'], 'suspension', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Диронет Джуниор', 'Агроветзащита', array['Dironet Junior', 'Диронет Юниор'], array['cat', 'dog'], 'suspension', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Празицид таблетки', 'Апиценна', array['Prazicid tablets', 'Празицид для собак', 'Празицид для кошек', 'Прозицид'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Азинокс', 'Агроветзащита', array['Azinox', 'Азинокс для собак и кошек', 'АВЗ Азинокс'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Альбен С', 'Агроветзащита', array['Alben S', 'Альбен-С', 'Альбен С для собак и кошек'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Фебтал', 'Агроветзащита', array['Febtal', 'Фебтал таблетки'], array['cat', 'dog'], 'tablet', array['worms'], null, null, null, true),
  ('antiparasitic', 'Фебтал Комбо', 'Агроветзащита', array['Febtal Combo', 'Фебтал-комбо суспензия', 'Фебтал суспензия'], array['cat', 'dog'], 'suspension', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Прател', 'Elanco', array['Pratel', 'Пратель', 'Прател таблетки'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Гельмимакс', 'Апиценна', array['Gelmimax', 'Гельмимакс-4', 'Гельмимакс-10', 'Гельмимакс-20', 'Гельмимакс-2', 'Хельмимакс'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Гельминтал Т', 'Экопром', array['Гельминтал таблетки', 'Gelmintal', 'Хельминтал', 'Гельминтал Мини Табс'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Гельминтал сироп', 'Экопром', array['Gelmintal syrup', 'Гельминтал суспензия', 'Гельминтал Мини Сироп'], array['cat', 'dog'], 'suspension', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Мильбецин Нео', 'Экопром', array['Milbecin Neo', 'Мильбецин', 'Мильбицин Нео'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Мильмакс-Нита', 'Нита-Фарм', array['Milmax-Nita', 'Мильмакс Нита', 'Милмакс'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Празител таблетки', 'Астрафарм', array['Prazitel tablets', 'Празител для кошек', 'Празител для котят и щенков'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Супрамил', 'Астрафарм', array['Supramil', 'Супрамил таблетки'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Квантум', 'ВИК', array['Kvantum', 'Quantum', 'Квантум VIC'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Пинпрамиль', 'ВИК', array['Pinpramil', 'Пинпрамил'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Фенпраз', 'Агробиопром', array['Fenpraz', 'Пчелодар Фенпраз', 'Фенпраз XL'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Фенпраз Форте', 'Агробиопром', array['Fenpraz Forte', 'Пчелодар Фенпраз Форте', 'Фенпраз Форте суспензия'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], 3, 'month', null, true),
  ('antiparasitic', 'Поливеркан', 'Ceva', array['Poliverkan', 'Polyverkan', 'Поливеркан сахарные кубики'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true),
  ('antiparasitic', 'Бимаксгард ТАБС', 'Валта', array['Bimaxgard Tabs', 'Бимаксгард', 'Бимаксгард Табс'], array['cat', 'dog'], 'tablet', array['worms', 'heartworm'], null, null, null, true),
  ('antiparasitic', 'Чистотел Глистогон', 'Экопром', array['Глистогон', 'Чистотел Глистогон Плюс', 'Chistotel Glistogon'], array['cat', 'dog'], 'tablet', array['worms'], 3, 'month', null, true)
on conflict (kind, lower(name)) do update
  set name = excluded.name, manufacturer = excluded.manufacturer, aliases = excluded.aliases, species = excluded.species,
      form = excluded.form, targets = excluded.targets, interval_value = excluded.interval_value,
      interval_unit = excluded.interval_unit, popularity = excluded.popularity, verified = true, updated_at = now();
