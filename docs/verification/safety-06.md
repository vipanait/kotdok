# SAFE-06: контент справочника «Можно ли это питомцу»

Отчёт о шестом этапе функции «Можно ли это питомцу»: 123 позиции справочника в `apps/web/content/safety/*.json`, два круга проверки агентами, все позиции в статусе `agent_reviewed`. Публикация — решение владельца; ветеринарный врач тексты не проверял.

## Паспорт

| Поле | Значение |
| --- | --- |
| Этап и название | SAFE-06 — контент справочника, до 120 позиций |
| Статус | ACCEPTED по критериям 1–5 как «контент проверен агентами»; публикация не выполнена и не входит в этап |
| Даты работы | 13 ноября 2026, Europe/Moscow |
| Версия плана | Бриф Task 6 из `.superpowers/sdd/2026-11-13-pet-safety/task-6-brief.md`, спека `docs/superpowers/specs/2026-11-13-pet-safety-design.md` |
| Проверенный код | `205be99` (контент), тесты — на `3a7fe63`, ветка `claude/can-pet-eat-f35f72` (отчёт добавляется поверх) |
| PR / коммиты | PR не создан. `2fda93d`, `638ebd7`, `db83861`, `205be99` — см. ниже |
| Окружение | Локальное: Node 25.2.1, vitest из `apps/web`. Источники читались авторами и проверяющими через WebFetch 13 ноября 2026 |
| Сборки | Не применимо: этап — контент, мобильных и production-сборок не касается |

## Что сделано

До этапа в справочнике было 12 пилотных позиций. Теперь их 123: 63 продукта, 30 растений, 9 лекарств и 21 бытовое вещество (лекарства и быт вместе — 30). Все — `agent_reviewed`, ни одной `published`.

1. **Авторы, 8 партий (sonnet, параллельно)**: F1–F4 (продукты), P1–P2 (растения), M1–M2 (лекарства и быт). Правила — `task-6-author.md`; каждый автор читал источники (ASPCA, Merck/MSD, Pet Poison Helpline, Cornell) и вёл заметки к партии с позициями, где источники расходятся. Результат — 110 черновиков новых позиций (с учётом пилотных их 122; 123-я — `griby-magazinnye`, добавленная на втором круге).
2. **Первый круг (opus, 9 проверяющих)**: по одному на каждую из 8 партий плюс «пилот» — 12 пилотных позиций и фиксированные тексты ответа ИИ (`apps/web/src/server/safety/ask-language.ts`). Каждый открывал источники сам, снимал утверждения без опоры, правил алиасы.
3. **Сужение проверки рвоты (`db83861`)**: проверка в `schema.ts` срабатывала на любое «вызыв…» рядом с «рвот…», и признак вроде «молочное может вызвать понос, жирное — рвоту» не проходил; проверяющие были вынуждены искажать корректные формулировки. Теперь `advisesVomiting` ловит совет (повелительное наклонение, инфинитив не после «может / не / нельзя», "induce vomiting", "make … vomit", "cause vomiting at home"), а строка про ветеринара проходит всегда. Ответ ИИ сохраняет прежнюю широкую проверку (`strictVomiting`), то есть мягче не стал.
4. **Второй круг (opus, 4 проверяющих по категориям)**: FOOD-A (30 продуктов), FOOD-B (33), PLANT (30), MEDHOUSE (30). План предполагал три проверяющих; продукты разделены надвое из-за объёма (63 позиции). Задача круга: все `safe` перепроверить отдельно; пары «кошка/собака» с разными вердиктами (лилия, перметрин, парацетамол, лук) — отдельно; согласованность с шестью страницами `/otravlenie`; ru и en не расходятся.

| Коммит | Что |
| --- | --- |
| `2fda93d` | Content: pet safety reference — 110 author drafts (before review rounds) |
| `638ebd7` | Content: pet safety reference — review round 1 |
| `db83861` | Web: pet safety — the vomiting check forbids advice, not signs |
| `205be99` | Content: pet safety reference — review round 2, 123 entries agent_reviewed |

| Файл или компонент | Что изменено | Зачем | Пункт брифа |
| --- | --- | --- | --- |
| `apps/web/content/safety/*.json` | 123 позиции (было 12) | Содержание справочника | Шаги 1–4 |
| `apps/web/src/features/safety/schema.ts` | `advisesVomiting` вместо широкой проверки в проверке справочника; `strictVomiting` для ИИ | Не заставлять переписывать верные формулировки | Шаг 2 |
| `apps/web/src/server/safety/ask-language.ts`, `ask-safety.ts` | Правка фиксированных текстов ИИ на первом круге; `ask-safety.ts` использует `strictVomiting` | Тексты ИИ и справочника совпадают по смыслу | Шаг 2 |
| `apps/web/content/README.md` | Актуальная английская строка про рвоту | Совпадает с проверкой | Шаг 2 |
| `apps/web/tests/server/safety/ask-guards.test.ts` | Случай для `strictVomiting` | TDD | Шаг 2 |

## Решения и отклонения

- **Замены позиций.** Заметки авторов и проверяющих замен позиций из списка брифа не фиксируют. Добавлена одна позиция сверх черновиков: `griby-magazinnye` (второй круг, FOOD-B): ASPCA называет магазинные грибы в целом безопасными, а алиасы «шампиньоны», «вёшенки», «шиитаке» попадали на `griby` с вердиктом `danger`; эти алиасы перенесены на новую карточку (`caution`/`watch` для обоих видов). «Калла» не заводилась. «Капли от блох для собак с перметрином» оформлены как `permetrin-kapli-ot-blokh` (кошке `danger`, собаке `caution`).
- **Правило «`safe` без явной опоры → `caution`»** действовало на обоих кругах. `safe` появился только там, где открытая страница названа явно (см. раздел 4); остальное осталось `caution`.
- **`watch` вместо `none` для `caution`**: 5 позиций с `caution`/`none` стали `watch` на первом круге (правило схемы, не смена вердикта).
- **Обобщённые алиасы убирались** там, где слово ловит более строгую или более мягкую карточку: «картошка», «паста», «лапша», «успокоительное», «bread», «sugar» и др.
- **Тест `pages.test.ts`** жёстко кодировал `shokolad` как `draft` и краснел после второго круга; коммит `3a7fe63` отвязал тесты страниц от статусов позиций (тесты сами задают состояние проверки), в этом отчёте он уже учтён.

## Матрица приёмки

| ID | Критерий из плана | Способ проверки | Ожидаемый результат | Фактический результат | PASS / FAIL / NOT RUN | Ссылка на запись проверки |
| --- | --- | --- | --- | --- | --- | --- |
| SAFE-06.1 | Не меньше 120 позиций; не меньше 55 продуктов, 28 растений, 28 лекарств и бытовых веществ | Скрипт `/private/tmp/claude-502/report-06/table.py` читает `apps/web/content/safety/*.json` и считает по `category` | ≥120; food ≥55; plant ≥28; medicine+household ≥28 | 123 файла; food 63, plant 30, medicine 9 + household 21 = 30 | PASS | Раздел 3 |
| SAFE-06.2 | Все проходят тесты контента: схема, связность, запрещённые слова, уникальность alias, оба языка | `npx vitest run tests/unit/safety tests/server/safety` в `apps/web` | Все тесты контента зелёные | 152 passed, 0 failed (на HEAD после `3a7fe63`) | PASS | «Автоматические проверки» |
| SAFE-06.3 | Каждая позиция прошла два круга; в отчёте есть таблица вердиктов с источниками и список ужесточённых | Заметки `task-6-round1-*.md` (9) и `task-6-round2-*.md` (4); статус в файлах; разделы 3 и 4 | 123 из 123 с двумя кругами; таблица и список есть | Все 123 позиции — `agent_reviewed`, `reviewedAt` 2026-11-13. Первый круг покрыл 122 (123-я, `griby-magazinnye`, создана на втором круге и проверена вторым кругом и сквозным списком). У всех 123 позиций в `sources` есть `url` | PASS с оговоркой: у `griby-magazinnye` один полный круг проверки, не два | Разделы 3, 4, 5 |
| SAFE-06.4 | Ни одна позиция не противоречит странице `/otravlenie` на ту же тему | Сверка проверяющими второго круга с шестью страницами `apps/web/content/toxins/*.json` | Нет противоречий вердиктов и советов | Сверены `shokolad`, `vinograd`, `ksilit`, `liliya`, `paracetamol`, `antifriz`: вердикты и «позвоните в клинику» совпадают. Найдено и исправлено одно расхождение: кошка в `ksilit` была `caution`/`watch`, статья «Ксилит опасен для кошек?» велит звонить в клинику, стало `caution`/`call_now`. Автоматического теста на сравнение со страницами нет — это ручная сверка | PASS | `task-6-round2-FOOD-A.md`, `-MEDHOUSE.md`, `-PLANT.md` |
| SAFE-06.5 | Статус — `agent_reviewed`; публикация — решение владельца | Скрипт считает `review.status` | Все `agent_reviewed`, ни одной `published` | 123 `agent_reviewed`, 0 `draft`, 0 `published` | PASS | Раздел 3 |

## Автоматические проверки

| Набор / назначение | Точная команда и рабочий каталог | Ревизия | Exit code | Passed / failed / skipped | Лог или запись запуска |
| --- | --- | --- | --- | --- | --- |
| Тесты справочника и ответа ИИ | `npx vitest run tests/unit/safety tests/server/safety`, `apps/web` | `3a7fe63` (HEAD) | 0 | Test Files 3 passed (3); Tests 152 passed (152) | вывод в сессии |

Первый прогон на `205be99` давал 1 failed, 144 passed (145): `pages.test.ts:46` ждал `shokolad` в статусе `draft`, а после второго круга он `agent_reviewed`. Это был недочёт теста; коммит `3a7fe63` отвязал тесты страниц от статусов позиций, повторный прогон на HEAD зелёный (152/152). Тесты читают настоящие файлы справочника, без моков данных; они не проверяют правдивость медицинских утверждений.

## Ручные проверки

Не проводились: этап — текст, страницы не менялись. Проверка утверждений против источников — работа проверяющих агентов (заметки `task-6-round1-*.md`, `task-6-round2-*.md`), не независимая экспертиза.

## 3. Таблица вердиктов (все 123)

Вердикты: `safe` — можно, `caution` — с осторожностью, `danger` — нельзя. `ifEaten`: `none`, `watch` — наблюдать, `call_now` — звонить в клинику сразу. Все источники имеют `url`; позиции без `url` отсутствуют (0). Таблица сгенерирована скриптом из файлов, порядок: категория, затем slug.

Сводка (кошка / собака):

| Категория | Позиций | safe | caution | danger |
| --- | --- | --- | --- | --- |
| food | 63 | 10 / 11 | 41 / 39 | 12 / 13 |
| plant | 30 | 2 / 2 | 17 / 18 | 11 / 10 |
| medicine | 9 | 0 / 0 | 0 / 0 | 9 / 9 |
| household | 21 | 0 / 0 | 2 / 2 | 19 / 19 |
| Итого | 123 | 12 / 13 | 60 / 59 | 51 / 51 |

| № | slug | Категория | Название | Кошка | Собака | Кошка: если съела | Собака: если съела | Источники | Статус |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `alkogol` | food | Алкоголь | danger | danger | call_now | call_now | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Pet Poison Helpline — Alcohol; Merck Veterinary Manual — Toxicoses From Alcohols in Animals | agent_reviewed |
| 2 | `ananas` | food | Ананас | caution | caution | watch | watch | Merck Veterinary Manual — Nutritional Requirements of Small Animals | agent_reviewed |
| 3 | `arahis` | food | Арахис и арахисовая паста | caution | caution | watch | watch | ASPCA — Sharing is Caring: Foods You Can Safely Share with Your Pet; Pet Poison Helpline — Sickeningly sweet: Xylitol toxicity in dogs; Merck Veterinary Manual — Tremorgenic Neuromycotoxicosis in Dogs | agent_reviewed |
| 4 | `arbuz` | food | Арбуз | caution | caution | watch | watch | ASPCA Animal Poison Control — Toxic and Non-Toxic Plants; ASPCA — 5 Toxic Seasonal Plants You Don't Want Your Pet To Fall For! | agent_reviewed |
| 5 | `avokado` | food | Авокадо | caution | caution | watch | watch | Pet Poison Helpline — Can Dogs Eat Avocado? Safety, Risks & What To Do; ASPCA Animal Poison Control — Toxic and Non-Toxic Plants: Avocado | agent_reviewed |
| 6 | `banan` | food | Банан | safe | safe | none | none | ASPCA Animal Poison Control — Edible Banana; Pet Poison Helpline — Are Cherries Safe for Dogs? | agent_reviewed |
| 7 | `bobovye` | food | Бобовые (фасоль, горох) | caution | caution | watch | watch | ASPCA — Pets and Produce: Top Tips on Vegetable Garden Safety; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 8 | `brokkoli` | food | Брокколи | caution | caution | watch | watch | ASPCA Animal Poison Control — Toxic and Non-Toxic Plants | agent_reviewed |
| 9 | `chernika` | food | Черника | caution | safe | watch | none | Pet Poison Helpline — Are Cherries Safe for Dogs?; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Nutritional Requirements of Small Animals | agent_reviewed |
| 10 | `citrusovye` | food | Цитрусовые | caution | caution | watch | watch | ASPCA Animal Poison Control — Orange; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 11 | `drozhzhevoe-testo` | food | Сырое дрожжевое тесто | danger | danger | call_now | call_now | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Food Hazards; Pet Poison Helpline — Bread Dough | agent_reviewed |
| 12 | `dynya` | food | Дыня | safe | safe | none | none | ASPCA Animal Poison Control — Honeydew Melon; Merck Veterinary Manual — Nutritional Requirements of Small Animals | agent_reviewed |
| 13 | `grechka` | food | Гречка | caution | caution | watch | watch | ASPCA Toxic and Non-Toxic Plants — Buckwheat; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 14 | `gretskie-orehi` | food | Грецкие орехи | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Tremorgenic Neuromycotoxicosis in Dogs | agent_reviewed |
| 15 | `griby` | food | Грибы | danger | danger | call_now | call_now | Pet Poison Helpline — Mushrooms; ASPCA — The Fungus Among Us: Mushroom Toxicosis; Merck Veterinary Manual — Overview of Mushrooms Toxic to Animals | agent_reviewed |
| 16 | `griby-magazinnye` | food | Грибы из магазина | caution | caution | watch | watch | ASPCA — The Fungus Among Us: Mushroom Toxicosis; ASPCA — People Foods to Avoid Feeding Your Pets; Pet Poison Helpline — Mushrooms | agent_reviewed |
| 17 | `grusha` | food | Груша | caution | caution | watch | watch | Merck Veterinary Manual — Nutritional Requirements of Small Animals | agent_reviewed |
| 18 | `hleb` | food | Хлеб | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 19 | `hurma` | food | Хурма | caution | caution | watch | watch | Merck Veterinary Manual — Nutritional Requirements of Small Animals | agent_reviewed |
| 20 | `jogurt-kefir` | food | Йогурт и кефир | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Cornell Feline Health Center — Feeding Your Cat; Pet Poison Helpline — Xylitol | agent_reviewed |
| 21 | `kabachok` | food | Кабачок | safe | safe | none | none | ASPCA Animal Poison Control — Zucchini Squash; ASPCA — Pets and Produce: Top Tips on Vegetable Garden Safety; ASPCA Animal Poison Control — Toxic and Non-Toxic Plants | agent_reviewed |
| 22 | `kapusta` | food | Капуста | caution | caution | watch | watch | ASPCA Animal Poison Control — Toxic and Non-Toxic Plants; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 23 | `kartofel-syroy` | food | Сырой и зелёный картофель | caution | caution | watch | watch | ASPCA — Pets and Produce: Top Tips on Vegetable Garden Safety; Pet Poison Helpline — Are Tomatoes Bad for Dogs? What's Safe & What's Toxic | agent_reviewed |
| 24 | `klubnika` | food | Клубника | safe | safe | none | none | ASPCA Animal Poison Control — Strawberry; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Nutritional Requirements of Small Animals | agent_reviewed |
| 25 | `kofe-chaj` | food | Кофе и чай (кофеин) | danger | danger | call_now | call_now | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Pet Poison Helpline — Caffeine; Merck Veterinary Manual — Food Hazards | agent_reviewed |
| 26 | `kokos` | food | Кокос | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 27 | `kolbasa-sosiski` | food | Колбаса и сосиски | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 28 | `kostochkovye` | food | Персик, абрикос и слива | caution | caution | call_now | call_now | Pet Poison Helpline — Peach Pits; ASPCA Animal Poison Control — Peach; ASPCA Animal Poison Control — Plum | agent_reviewed |
| 29 | `ksilit` | food | Ксилит | caution | danger | call_now | call_now | Merck Veterinary Manual — Xylitol Toxicosis in Dogs; Pet Poison Helpline — Xylitol; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 30 | `kukuruza` | food | Кукуруза и початки | caution | caution | watch | call_now | ASPCA — 5 Toxic Seasonal Plants You Don't Want Your Pet To Fall For!; Merck Veterinary Manual — Gastrointestinal Obstruction in Small Animals | agent_reviewed |
| 31 | `kuritsa-varenaya` | food | Варёная курица | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Nutritional Requirements of Small Animals; Cornell Feline Health Center — Food Allergies | agent_reviewed |
| 32 | `luk-chesnok` | food | Лук и чеснок | danger | danger | call_now | call_now | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Garlic and Onion (Allium spp) Toxicosis in Animals | agent_reviewed |
| 33 | `makadamiya` | food | Орехи макадамия | danger | danger | call_now | call_now | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Food Hazards; Pet Poison Helpline — Macadamia Nuts | agent_reviewed |
| 34 | `makarony` | food | Макароны | safe | safe | none | none | Cornell Riney Canine Health Center — Re-evaluating your dog's diet; Cornell Riney Canine Health Center — Diarrhea; Cornell Feline Health Center — Feeding Your Cat | agent_reviewed |
| 35 | `med` | food | Мёд | caution | caution | watch | watch | Merck Veterinary Manual — Nutritional Requirements of Small Animals; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 36 | `mindal` | food | Миндаль | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 37 | `moloko` | food | Молоко | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 38 | `morkov` | food | Морковь | safe | safe | none | none | ASPCA Animal Poison Control — Carrot Flower (Daucus carota var. sativa); ASPCA — Pets and Produce: Top Tips for Vegetable Garden Safety | agent_reviewed |
| 39 | `morozhenoe` | food | Мороженое | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Cornell Feline Health Center — Feeding Your Cat | agent_reviewed |
| 40 | `muskatnyj-oreh` | food | Мускатный орех | danger | danger | call_now | call_now | Pet Poison Helpline — Nutmeg and Cinnamon Toxicity | agent_reviewed |
| 41 | `ogurec` | food | Огурец | safe | safe | none | none | ASPCA Animal Poison Control — Cucumber; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 42 | `ovsyanka` | food | Овсянка | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Cornell Feline Health Center — Feeding Your Cat | agent_reviewed |
| 43 | `pechen` | food | Печень | caution | caution | watch | watch | Merck Veterinary Manual — Nutritional Requirements of Small Animals; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 44 | `pomidor` | food | Помидоры (включая зелёные части) | caution | caution | watch | watch | ASPCA Animal Poison Control — Tomato Plant; ASPCA — Pets and Produce: Top Tips on Vegetable Garden Safety; Pet Poison Helpline — Are Tomatoes Bad for Dogs? What's Safe & What's Toxic | agent_reviewed |
| 45 | `ris` | food | Рис | safe | safe | none | none | Cornell Riney Canine Health Center — Re-evaluating your dog's diet; Cornell Riney Canine Health Center — Diarrhea; Cornell Feline Health Center — Feeding Your Cat | agent_reviewed |
| 46 | `shokolad` | food | Шоколад | danger | danger | call_now | call_now | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Chocolate Toxicosis in Animals | agent_reviewed |
| 47 | `shpinat` | food | Шпинат | caution | caution | watch | watch | ASPCA Animal Poison Control — Toxic and Non-Toxic Plants; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 48 | `sladosti-sahar` | food | Сладости и сахар | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Pet Poison Helpline — Xylitol | agent_reviewed |
| 49 | `slivochnoe-maslo-zhirnaya-eda` | food | Сливочное масло и жирная еда | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Pancreatitis and Other Disorders of the Pancreas in Dogs; Merck Veterinary Manual — Disorders of the Pancreas in Cats | agent_reviewed |
| 50 | `solenoe` | food | Солёное (чипсы, солёные закуски) | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Pet Poison Helpline — Salt | agent_reviewed |
| 51 | `syr` | food | Сыр | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Cornell Feline Health Center — Feeding Your Cat; Cornell Riney Canine Health Center — Re-evaluating your dog's diet | agent_reviewed |
| 52 | `syraya-ryba` | food | Сырая рыба | caution | caution | watch | watch | Merck Veterinary Manual — Nutritional Disorders of the Spinal Column and Cord in Animals; Merck Veterinary Manual — Salmon Poisoning Disease and Elokomin Fluke Fever in Dogs; Cornell Feline Health Center — Feeding Your Cat | agent_reviewed |
| 53 | `syroe-myaso` | food | Сырое мясо | caution | caution | watch | watch | Cornell Feline Health Center — Feeding Your Cat; Cornell Riney Canine Health Center — Raw foods for dogs: evidence-based advice; FDA — Get the Facts about Salmonella | agent_reviewed |
| 54 | `syrye-kosti` | food | Сырые кости | danger | danger | call_now | call_now | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Disorders of the Esophagus in Dogs | agent_reviewed |
| 55 | `syrye-yajtsa` | food | Сырые яйца | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; FDA — Get the Facts about Salmonella | agent_reviewed |
| 56 | `tunets-konservirovannyj` | food | Консервированный тунец | caution | caution | watch | watch | Merck Veterinary Manual — Nutritional Requirements of Small Animals; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 57 | `tykva` | food | Тыква | safe | safe | none | none | Pet Poison Helpline — Pumpkins: A Safe and Nutritious Treat for Your Furry Friend; ASPCA — 5 Toxic Seasonal Plants You Don't Want Your Pet To Fall For!; ASPCA Animal Poison Control — Acorn Squash (Cucurbita pepo, similar plant: pumpkin) | agent_reviewed |
| 58 | `vareny-kartofel` | food | Варёный картофель | safe | safe | none | none | ASPCA — Pets and Produce: Top Tips on Vegetable Garden Safety; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 59 | `varenye-kosti` | food | Варёные кости | danger | danger | call_now | call_now | ASPCApro — 4 Harmful Thanksgiving Foods for Pets; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Merck Veterinary Manual — Disorders of the Esophagus in Dogs | agent_reviewed |
| 60 | `varenye-yajtsa` | food | Варёные яйца | caution | caution | watch | watch | ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets; Cornell Feline Health Center — Feeding Your Cat; Cornell Riney Canine Health Center — Re-evaluating your dog's diet | agent_reviewed |
| 61 | `vinograd` | food | Виноград и изюм | danger | danger | call_now | call_now | Merck Veterinary Manual — Grape, Raisin, and Tamarind Toxicosis in Dogs; ASPCA Animal Poison Control — People Foods to Avoid Feeding Your Pets | agent_reviewed |
| 62 | `vishnya-chereshnya` | food | Вишня и черешня | danger | danger | call_now | call_now | Pet Poison Helpline — My Cat Ate a Cherry Pit; Pet Poison Helpline — My Dog Ate a Cherry Pit; ASPCA Animal Poison Control — Cherry | agent_reviewed |
| 63 | `yabloko` | food | Яблоко | caution | caution | watch | watch | ASPCA Animal Poison Control — Apple (Malus sylvestrus) | agent_reviewed |
| 64 | `antifriz` | household | Антифриз | danger | danger | call_now | call_now | Pet Poison Helpline — Antifreeze Poisoning in Dogs & Cats (Ethylene Glycol Poisoning); Merck Veterinary Manual — Ethylene Glycol Toxicosis in Animals | agent_reviewed |
| 65 | `aromadiffuzory` | household | Ароматические диффузоры | danger | danger | call_now | call_now | Pet Poison Helpline — Essential Oils; ASPCA — Is the Latest Home Trend Harmful to Your Pets? What You Need to Know! | agent_reviewed |
| 66 | `batareiki` | household | Батарейки (включая плоские «таблетки») | danger | danger | call_now | call_now | Pet Poison Helpline — Batteries | agent_reviewed |
| 67 | `efirnye-masla` | household | Эфирные масла | danger | danger | call_now | call_now | Pet Poison Helpline — Essential Oils; ASPCA — Is the Latest Home Trend Harmful to Your Pets? What You Need to Know! | agent_reviewed |
| 68 | `insekticidy` | household | Инсектициды (от тараканов, муравьёв) | danger | danger | call_now | call_now | Pet Poison Helpline — Insecticides; MSD Veterinary Manual — Plant-Derived Insecticide Toxicosis in Animals; Today's Veterinary Nurse — Top 10 Toxins That Are Rarely Serious (ASPCA Animal Poison Control Center) | agent_reviewed |
| 69 | `kapsuly-dlya-stirki` | household | Капсулы для стирки | danger | danger | call_now | call_now | Pet Poison Helpline — How Detergent Pods Can Harm Your Dog; ASPCA Animal Poison Control — Keep Laundry Detergent Pods Away from Pets; MSD Veterinary Manual — Detergents, Soaps, and Shampoos | agent_reviewed |
| 70 | `kraski-rastvoriteli` | household | Краски и растворители | danger | danger | call_now | call_now | Merck Veterinary Manual — Petroleum Product Poisoning in Animals; VCA Animal Hospitals — Paint and Varnish Poisoning in Dogs and Cats (Pet Poison Helpline) | agent_reviewed |
| 71 | `krysinyj-yad` | household | Крысиный яд | danger | danger | call_now | call_now | Pet Poison Helpline — Mouse and Rat Poison: Rodenticides Poisonous to Dogs & Cats | agent_reviewed |
| 72 | `marihuana` | household | Марихуана (каннабис, включая выпечку) | danger | danger | call_now | call_now | Pet Poison Helpline — Marijuana; ASPCA — Recreational Drugs Makes ASPCA Annual List of Top Pet Toxins for the First Time | agent_reviewed |
| 73 | `montazhnaya-pena-klej` | household | Монтажная пена и клей (полиуретановый) | danger | danger | call_now | call_now | Pet Poison Helpline — Gorilla Glue; VCA Animal Hospitals — Expanding Glues (Pet Poison Helpline) | agent_reviewed |
| 74 | `naftalin` | household | Нафталин | danger | danger | call_now | call_now | Pet Poison Helpline — Mothballs; Merck Veterinary Manual — Toxicosis From Mothballs in Animals | agent_reviewed |
| 75 | `nikotin` | household | Никотин, сигареты и вейпы | danger | danger | call_now | call_now | Pet Poison Helpline — Nicotine | agent_reviewed |
| 76 | `otbelivatel` | household | Отбеливатель (хлорка) | danger | danger | call_now | call_now | Pet Poison Helpline — My Dog Ate Bleach: The Dangers of Cleaning Products; Pet Poison Helpline — #StopBleachingFido; MSD Veterinary Manual — Household Hazards | agent_reviewed |
| 77 | `permetrin-kapli-ot-blokh` | household | Капли от блох с перметрином | danger | caution | call_now | watch | Pet Poison Helpline — Flea and Tick Toxicity: Questions and Answers; Pet Poison Helpline — Pyrethrins & Pyrethroids; MSD Veterinary Manual — Plant-Derived Insecticide Toxicosis in Animals | agent_reviewed |
| 78 | `prochistka-trub` | household | Средство для прочистки труб | danger | danger | call_now | call_now | Pet Poison Helpline — Alkalis; MSD Veterinary Manual — Toxicoses From Corrosive Agents in Animals; MSD Veterinary Manual — Household Hazards | agent_reviewed |
| 79 | `protivogololednye-reagenty` | household | Противогололёдные реагенты | danger | danger | call_now | call_now | ASPCA — Keeping Pets Safe during Winter: The Dangers of Ice Melts; Pet Poison Helpline — Is there really a “safe” ice melt? | agent_reviewed |
| 80 | `silikagel` | household | Силикагель | caution | caution | watch | watch | ASPCA — Learn More About Silica Gel, A Common Pet Toxin; Pet Poison Helpline — Are those packaging freshness packets really toxic to dogs? | agent_reviewed |
| 81 | `solyonoe-testo-plastilin` | household | Солёное тесто и домашний пластилин | danger | danger | call_now | call_now | Pet Poison Helpline — Play Dough (Homemade) | agent_reviewed |
| 82 | `sredstvo-ot-slizney` | household | Средство от слизней (метальдегид) | danger | danger | call_now | call_now | Pet Poison Helpline — Metaldehyde; MSD Veterinary Manual — Metaldehyde Poisoning | agent_reviewed |
| 83 | `udobreniya` | household | Удобрения | danger | danger | call_now | call_now | Pet Poison Helpline — Fertilizers; Pet Poison Helpline — Bone Meal & Blood Meal | agent_reviewed |
| 84 | `zubnaya-pasta` | household | Зубная паста (для людей) | caution | danger | watch | call_now | ASPCA — Poisonous Household Products; ASPCA — Xylitol: The Sweetener That Is Not So Sweet for Pets; Pet Poison Helpline — Fluoride Toothpaste & Pets | agent_reviewed |
| 85 | `antidepressanty` | medicine | Антидепрессанты | danger | danger | call_now | call_now | ASPCA Animal Poison Control — What Every Pet Parent Needs to Know About Antidepressant Toxicity; MSD Veterinary Manual — Toxicoses in Animals From Human Antidepressants, Anxiolytics, and Sleep Aids | agent_reviewed |
| 86 | `aspirin` | medicine | Аспирин | danger | danger | call_now | call_now | Pet Poison Helpline — Aspirin; Pet Poison Helpline — Cats and Aspirin; MSD Veterinary Manual — Poisoning from Human Over-the-Counter Drugs | agent_reviewed |
| 87 | `ibuprofen` | medicine | Ибупрофен | danger | danger | call_now | call_now | Pet Poison Helpline — Ibuprofen; Merck Veterinary Manual — Poisoning from Human Over-the-Counter Drugs | agent_reviewed |
| 88 | `ksilometazolin-oksimetazolin` | medicine | Сосудосуживающие капли в нос | danger | danger | call_now | call_now | Pet Poison Helpline — Imidazoline Decongestants; MSD Veterinary Manual — Poisoning from Human Over-the-Counter Drugs | agent_reviewed |
| 89 | `naproksen-diklofenak` | medicine | Напроксен и диклофенак | danger | danger | call_now | call_now | Pet Poison Helpline — NSAIDs; Pet Poison Helpline — Naproxen; MSD Veterinary Manual — Poisoning from Human Over-the-Counter Drugs | agent_reviewed |
| 90 | `paracetamol` | medicine | Парацетамол | danger | danger | call_now | call_now | Pet Poison Helpline — Acetaminophen; Merck Veterinary Manual — Poisoning from Human Over-the-Counter Drugs | agent_reviewed |
| 91 | `snotvornye-uspokoitelnye` | medicine | Снотворные и успокоительные | danger | danger | call_now | call_now | Pet Poison Helpline — Sleep Aids; MSD Veterinary Manual — Toxicoses in Animals From Human Antidepressants, Anxiolytics, and Sleep Aids | agent_reviewed |
| 92 | `vitamin-d` | medicine | Витамин D | danger | danger | call_now | call_now | MSD Veterinary Manual — Poisoning from Human Over-the-Counter Drugs; Pet Poison Helpline — Vitamin D Toxicity in Dogs | agent_reviewed |
| 93 | `zhelezo-multivitaminy` | medicine | Препараты железа и мультивитамины | danger | danger | call_now | call_now | MSD Veterinary Manual — Poisoning from Human Over-the-Counter Drugs; Pet Poison Helpline — Iron | agent_reviewed |
| 94 | `aloe` | plant | Алоэ | caution | caution | watch | watch | ASPCA Animal Poison Control — Aloe; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 95 | `amarillis` | plant | Амариллис (гиппеаструм) | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Amaryllis; Pet Poison Helpline — Amaryllis | agent_reviewed |
| 96 | `azaliya-rododendron` | plant | Азалия и рододендрон | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Azalea; Pet Poison Helpline — Azalea; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 97 | `diffenbahiya` | plant | Диффенбахия | caution | caution | watch | watch | ASPCA Animal Poison Control — Dieffenbachia; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 98 | `dratsena` | plant | Драцена | caution | caution | watch | watch | ASPCA Animal Poison Control — Dracaena; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 99 | `ficus` | plant | Фикус | caution | caution | watch | watch | ASPCA Animal Poison Control — Weeping Fig; Pet Poison Helpline — Ficus | agent_reviewed |
| 100 | `filodendron` | plant | Филодендрон | caution | caution | watch | watch | ASPCA Animal Poison Control — Heartleaf Philodendron; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 101 | `giacint` | plant | Гиацинт | caution | caution | call_now | call_now | ASPCA Animal Poison Control — Hyacinth; Pet Poison Helpline — Tulips and Hyacinths; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 102 | `gortenziya` | plant | Гортензия | caution | caution | watch | watch | ASPCA Animal Poison Control — Hydrangea; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 103 | `hlorofitum` | plant | Хлорофитум | safe | safe | none | none | ASPCA Animal Poison Control — Spider Plant | agent_reviewed |
| 104 | `hrizantema` | plant | Хризантема | caution | caution | watch | watch | ASPCA Animal Poison Control — Chrysanthemum; Pet Poison Helpline — Chrysanthemum | agent_reviewed |
| 105 | `kalanhoe` | plant | Каланхоэ | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Kalanchoe; Pet Poison Helpline — Kalanchoe; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 106 | `koshachya-myata` | plant | Кошачья мята | caution | caution | watch | watch | ASPCA Animal Poison Control — Catnip | agent_reviewed |
| 107 | `landysh` | plant | Ландыш | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Lily of the Valley; Pet Poison Helpline — Lily of the Valley; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 108 | `liliya` | plant | Лилия | danger | caution | call_now | watch | ASPCA Animal Poison Control — Easter Lily; ASPCA — Which Lilies Are Toxic to Pets?; Pet Poison Helpline — Lilies | agent_reviewed |
| 109 | `monstera` | plant | Монстера | caution | caution | watch | watch | ASPCA Animal Poison Control — Swiss Cheese Plant (Monstera deliciosa); MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 110 | `narcis` | plant | Нарцисс | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Daffodil; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 111 | `oleandr` | plant | Олеандр | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Oleander; Pet Poison Helpline — Oleander; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 112 | `omela` | plant | Омела | danger | danger | call_now | call_now | ASPCA Animal Poison Control — American Mistletoe; Pet Poison Helpline — Mistletoe; Pet Poison Helpline — Holiday Plants | agent_reviewed |
| 113 | `orhideya` | plant | Орхидея (фаленопсис) | safe | safe | none | none | ASPCA Animal Poison Control — Phalaenopsis Orchid | agent_reviewed |
| 114 | `plyusch` | plant | Плющ | caution | caution | watch | watch | ASPCA Animal Poison Control — English Ivy; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 115 | `puansettiya` | plant | Пуансеттия | caution | caution | watch | watch | ASPCA Animal Poison Control — Poinsettia; Pet Poison Helpline — Poinsettia | agent_reviewed |
| 116 | `sagovaya-palma` | plant | Саговая пальма (саговник) | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Sago Palm; Pet Poison Helpline — Sago Palm; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 117 | `sansevieriya` | plant | Сансевиерия | caution | caution | watch | watch | ASPCA Animal Poison Control — Snake Plant; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 118 | `scindapsus` | plant | Сциндапсус (эпипремнум) | caution | caution | watch | watch | ASPCA Animal Poison Control — Golden Pothos; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 119 | `spatifillum` | plant | Спатифиллум | caution | caution | watch | watch | ASPCA Animal Poison Control — Peace Lily; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 120 | `tis` | plant | Тис | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Yew; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 121 | `tsiklamen` | plant | Цикламен | danger | danger | call_now | call_now | ASPCA Animal Poison Control — Cyclamen; Pet Poison Helpline — Cyclamen; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |
| 122 | `tyulpan` | plant | Тюльпан | caution | caution | watch | watch | ASPCA Animal Poison Control — Tulip; Pet Poison Helpline — Tulips and Hyacinths | agent_reviewed |
| 123 | `zamiokulkas` | plant | Замиокулькас | caution | caution | watch | watch | ASPCA — These Houseplants Can Cause Trouble for Your Pets; MSD Veterinary Manual — Houseplants and Ornamentals Toxic to Animals | agent_reviewed |

## 4. Вердикты, изменённые на проверке

Источники — заметки `task-6-round1-*.md` и `task-6-round2-*.md`. Правило: расхождение источников или тонкие данные → строже; `safe` только с явной опорой на открытую страницу.

### Стали строже

| Позиция | Было → стало | Причина и источники |
| --- | --- | --- |
| `syrye-kosti` (кошка, собака) | caution → danger, `call_now` (круг 1, F1) | ASPCA советует не давать сырые кости обоим видам ("injury or obstruction"), ни один первичный источник не поддерживает их. Круг 2 сохранил; убран алиас «кости для собак» (так же называют жевательные кости из зоомагазина) |
| `kalanhoe` (кошка) | → danger (круг 1, P1) | ASPCA/PPH: сердечные эффекты редки; MSD относит каланхоэ к сердечным гликозидам с узким запасом, кошки чувствительнее. Расхождение → строже |
| `kalanhoe` (собака) | caution → danger, `call_now` (круг 2, PLANT) | ASPCA и PPH не разделяют виды; MSD — «among some of the most toxic» для обоих; «кошки чувствительнее» — градиент, не повод для более мягкой карточки собаке. Карточка собаки уже говорила «звоните сразу», и «С осторожностью» противоречило её же совету |
| `giacint` (оба вида) | срочность `call_now` (круг 1, P1) | ASPCA/PPH: только ЖКТ; MSD: редкие смерти после луковиц; ASPCA: дрожь. Вердикт остался `caution`, срочность строже |
| `aromadiffuzory` (собака) | caution/watch → danger/call_now (круг 1, M2) | Вопрос «если выпила»: жидкость — эфирное масло, пероральный путь худший (PPH); ASPCA: сама по себе ингаляция обычно безопасна — это сказано в тексте |
| `ksilit` (кошка) | срочность watch → `call_now` (круг 2, FOOD-A) | Статья `/otravlenie` «Ксилит опасен для кошек?» велит звонить в клинику; карточка с `watch` ей противоречила. Вердикт `caution` не менялся |

Оставлены строгими при расхождении или тонких данных: `makadamiya` (кошка, `danger`; Merck: болезнь описана только у собак), `vishnya-chereshnya`, `muskatnyj-oreh` (PPH: рецептурные количества вряд ли вредны; ярлык «Нельзя» оставлен), `tsiklamen` (ASPCA тяжёлые признаки vs PPH «uncommon»), `otbelivatel` (разбавленный — лёгкое раздражение, концентрацию на глаз не оценить), `kapsuly-dlya-stirki` (кошка: все данные о собаках), `liliya` (собака `caution`: растительные страницы ASPCA «не токсична для собак» vs статья ASPCA о лилиях).

### Стали мягче

| Позиция | Было → стало | Причина и источники |
| --- | --- | --- |
| `ksilit` (кошка) | danger → caution/`watch` (круг 1, PILOT), затем `call_now` (круг 2) | Merck: "cats are not at risk for hypoglycemia or liver injury from xylitol toxicosis"; ни один источник не описывает случай у кошки. Исследование J Vet Pharmacol Ther 2018 проверяющий прочитал только по сниппету, в файл оно не вынесено. Статья `/otravlenie` просит звонить в клинику, поэтому срочность `call_now` |
| `kostochkovye` (оба вида) | danger → caution/`call_now` (круг 1, F4; подтверждено на круге 2, FOOD-B) | PPH Peach Pits: цианид выделяется только из тщательно разжёванной косточки, кошки и собаки так не жуют; главный риск — закупорка ЖКТ у мелкой собаки и кошки. ASPCA: токсичны ветки, листья, семена, но не мякоть. Вишня остаётся `danger`: PPH называет её «definite no» |
| `ris`, `makarony` (собака) | caution → safe (круг 1, F2) | Cornell Riney (диета при расстройстве): отварная курица с рисом, варёная паста |
| `ris`, `makarony` (кошка) | caution → safe (круг 2, FOOD-A) | Cornell Riney «Diarrhea»: лёгкую диарею «у кошек и собак» можно лечить дома щадящей диетой, в том числе белым рисом; паста там же ("Cooked pasta is another option"). Опора — одна страница, см. решение 9 |
| `vareny-kartofel` (оба вида) | caution → safe (круг 1, F2) | ASPCA, статья 2018 года про овощи на грядке: варёный картофель в умеренном количестве нормален, сырой может быть проблемой. Единственный источник, см. решение 8 |
| `tykva`, `banan` (оба вида) | caution → safe (круг 1 записал в заметках, в файлы не попало; записано на круге 2, FOOD-B) | `tykva`: PPH «Pumpkins: A Safe and Nutritious Treat»; ASPCA «5 Toxic Seasonal Plants» (нетоксична для собак и кошек); ASPCA Acorn Squash. `banan`: ASPCA Edible Banana (нетоксичен); PPH «Are Cherries Safe for Dogs?» называет бананы допустимым лакомством. Опора — преимущественно страницы о растении, не пищевые |
| `dynya`, `klubnika` (оба вида) | caution → safe (круг 1, F4) | ASPCA Honeydew Melon / Strawberry: растение нетоксично для собак и кошек; `dynya` — без корки и семян, изредка |
| `chernika` (собака) | caution → safe (круг 1, F4) | PPH «Are Cherries Safe for Dogs?» называет чернику допустимым лакомством; для кошки страница не говорит ничего, кошка остаётся `caution` |

Прочие `safe` без смены на проверке: `ogurec`, `kabachok` (ASPCA, F3), `orhideya` (ASPCA Phalaenopsis orchid, P2; общие алиасы на орхидею убраны), `hlorofitum` (ASPCA Spider Plant).

## 5. Происшествия

- **Восемь файлов M2 отсутствовали после «готово» автора.** Автор партии M2 отчитался о 14 позициях, но на диске при проверке координатора были только первые 6: команда дозаписи не отработала, остальные 8 не были созданы. Автор был возобновлён и переписал 8 файлов в собственной папке (`/private/tmp/claude-502/gen-M2/`); они вошли в `2fda93d`. Вывод: наличие файлов на диске проверяется после каждого «готово».
- **Авторы делили одну черновую папку и затирали генераторы друг друга.** Несколько партий писали скрипт в общую `/private/tmp/claude-502/gen`; автор P2 отметил это в заметках, и проверяющим первого круга велено сверять содержимое каждого файла со slug.
- **Повышение до `safe` у `tykva` и `banan` записано в заметках, но не попало в файлы.** Проверяющий F3 в заметках первого круга написал «safe: tykva, banan», а поле `verdict` в файлах осталось `caution`. Обнаружено на втором круге (FOOD-B): вердикт записан в файлы, источников теперь по два и больше.
- **Проверяющий второго круга сначала пометил 5 позиций проверенными, не открывая источников.** MEDHOUSE поставил `agent_reviewed` для `otbelivatel`, `kapsuly-dlya-stirki`, `prochistka-trub`, `kraski-rastvoriteli`, `udobreniya`, не перечитав их источники. Координатор постановил: либо перечитать, либо вернуть в `draft`: статус должен значить две независимые проверки. Проверяющий открыл все источники заново; вердикты не изменились. Отдельно: PLANT не перечитывал источники у 14 растений (`landysh`, `azaliya-rododendron`, `oleandr`, `sagovaya-palma`, `diffenbahiya`, `monstera`, `spatifillum`, `filodendron`, `scindapsus`, `aloe`, `ficus`, `plyusch`, `puansettiya`, `gortenziya`) и сверил их с MSD (открытым заново) и цитатами первого круга; это записано в его заметках.
- **Слишком широкая проверка рвоты.** Она срабатывала на любое «вызыв…» рядом с «рвот…», и корректные признаки («может вызвать … рвоту») приходилось переписывать. Сужена в `db83861` до советов; ответ ИИ оставлен на строгой версии. Повторная проверка сужения (sonnet) шла параллельно со вторым кругом; `ask-guards.test.ts` на тот момент — 74/74.
- **Устаревший тест.** `pages.test.ts` жёстко прописывал `shokolad` как черновик и краснел после перевода пилотных в `agent_reviewed`. Исправлено в `3a7fe63`; прогон на HEAD зелёный.
- **Описание `griby-magazinnye` — 178 символов при пределе 160**, падал тест страниц; исправлено на втором круге.
- **Названия источников у авторов.** Многие страницы PPH и Merck у авторов отдавали 404 или были названы по памяти (плесень на орехах, тиаминаза, лососёвое отравление). Проверяющие первого круга открывали источники сами, подтвердили спорное через Merck, снимали утверждения без опоры и заменяли общие названия («Pet Poison Helpline») реальными страницами.

## 6. Решения для владельца

Текущий вердикт — как записан в файлах; изменить можно правкой одного поля с перезапуском тестов.

1. `protivogololednye-reagenty`: сейчас `danger` для обоих видов (ASPCA: слизывание с лап обычно даёт лишь расстройство ЖКТ; много съеденного → натрий → судороги). Альтернатива: `caution`/`watch` для случая «слизал с лап».
2. `griby-magazinnye`: сейчас `caution`/`watch` (за `safe` только ASPCA; грибы чаще съедают с луком и чесноком, возможна путаница с дикими). Альтернатива: `safe`.
3. `muskatnyj-oreh`: сейчас `danger`/`call_now`, в том числе для крошки пирога (PPH: рецептурные количества вряд ли вредны; текст это говорит, ярлык «Нельзя» остаётся). Альтернатива: `caution`.
4. `giacint`: сейчас `caution`/`call_now`, тогда как `tsiklamen`, `amarillis`, `narcis` — `danger`, профили сходны (ЖКТ, редко тяжёлое после луковиц). Альтернатива: `danger` для гиацинта либо смягчить остальные.
5. `tsiklamen`: сейчас `danger` (правило «расхождение → строже»); для объеденного листа, возможно, слишком строго (PPH: тяжёлые признаки редки). Альтернатива: `caution`.
6. `koshachya-myata` для собаки: сейчас `caution`/`watch` (на открытых страницах нет данных о собаках, держится на их отсутствии). Альтернатива: `safe`.
7. `chernika` для кошки: сейчас `caution`, собаке `safe` (разница лишь в наличии источника, биологической причины нет). Альтернатива: `safe` кошке.
8. `vareny-kartofel`: сейчас `safe` на одной новостной статье ASPCA 2018 года. Альтернатива: `caution`, пока нет второго источника.
9. `ris`, `makarony` для кошки: сейчас `safe` на одной странице Cornell, где названы кошки. Альтернатива: `caution`.
10. `syrye-kosti`: сейчас `danger`/`call_now` для обоих видов, жёстко для владельцев, кормящих сырым (ASPCA называет кошек и собак). Альтернатива: `caution`/`watch` с пояснением про сырое кормление.
11. `makadamiya` для кошки: сейчас `danger` (болезнь описана только у собак, текст это говорит). Альтернатива: `caution`.
12. `liliya` для собаки: сейчас `caution`/`watch` (растительные страницы ASPCA «нетоксична для собак» vs статья ASPCA о лилиях «can be toxic to both dogs and cats»). Альтернатива: `danger`, как кошке.
13. `zubnaya-pasta`: запрос «зубная паста для собак» попадает на карточку зубной пасты для людей (собака `danger`, кошка `caution`), хотя название говорит «для людей». Альтернатива: отдельная карточка или иное поведение поиска.

## 7. Статус

- **Все 123 позиции — `agent_reviewed`, ни одной `published`.** Два круга проверки агентами: первый — 122 позиции, `griby-magazinnye` создана на втором.
- **Ветеринарный врач тексты не проверял.** Агентская проверка — сверка с источниками, не экспертиза.
- **Публикация — решение владельца** (или исполнителя по его прямому слову). Пока ничего не опубликовано, справочник на production пуст.
- **Тесты зелёные** на HEAD (152/152) после `3a7fe63`.

Итог: 5 из 5 критериев PASS (критерий 3 — с оговоркой про `griby-magazinnye`). Следующий шаг: принять решения 1–13, затем публиковать.

## История проверок

- 13 ноября 2026 — авторы: `task-6-batch-*-notes.md`; первый круг: `task-6-round1-*.md`; второй круг: `task-6-round2-*.md`; журнал: `progress.md`, строки «Task 6:». Прогон тестов — раздел «Автоматические проверки», ревизия `205be99`.
