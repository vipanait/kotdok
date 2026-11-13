# SAFE-01: справочник «Можно ли» — схема, загрузчик, поиск, пометки, пилот

Отчёт о первом этапе функции «Можно ли это питомцу»: справочник в репозитории, правила контента, чистые функции поиска и пометок под питомца, 12 пилотных позиций.

## Паспорт

| Поле | Значение |
| --- | --- |
| Этап и название | SAFE-01 — справочник: схема, загрузчик, поиск, пометки, правила контента, 12 пилотных позиций |
| Статус | ACCEPTED (контент — черновики, см. «Непроверенное и риски») |
| Даты работы | 13 ноября 2026, Europe/Moscow |
| Версия плана | [Спека](../superpowers/specs/2026-11-13-pet-safety-design.md), [план](../superpowers/plans/2026-11-13-pet-safety.md), бриф Task 1 из `.superpowers/sdd/2026-11-13-pet-safety/` |
| Проверенный код | `f0fc4ed` на ветке `claude/can-pet-eat-f35f72` |
| PR / коммиты | PR не создан. `a5b35fc` Web + shared: pet safety reference — schema, search, pet notes, pilot entries; `f0fc4ed` Web + shared: pet safety review fixes — pilot entries back to draft |
| Окружение | Локальное: Node из `package-lock`, vitest 4.1.11, TypeScript ~6.0.3. База, сеть и dev-сервер не нужны |
| Сборки | Неприменимо: ни страниц, ни маршрутов, ни кода приложения этап не меняет |

## Что сделано

До этапа справочника не было. Теперь позиция — один JSON-файл с русским и английским текстом. Схема не пропускает файл, нарушающий правила вердикта, и загрузчик падает с именем файла. Поиск и пометки — чистые функции в `packages/shared`, ими будут пользоваться сервер, приложение и хаб сайта.

| Файл или компонент | Что изменено | Зачем | ID пункта плана |
| --- | --- | --- | --- |
| `apps/web/src/features/safety/schema.ts` | `safetyEntrySchema` (Zod), константы категорий, вердиктов и `ifEaten`, `SAFETY_FORBIDDEN_WORDS_EN`, `textsOfEntry` | Правила связности в `superRefine`: `danger ⇒ call_now`, `safe ⇒ none`, у `danger` не меньше двух признаков на каждом языке, лекарство — только `danger`, бытовое вещество — не `safe`, `firstSteps` и `avoid` обязательны при `ifEaten ≠ none` | SAFE-01 шаг 6 |
| `apps/web/src/features/safety/load.ts` | `allEntries`, `visibleEntries`, `publishedEntries`, `entryBySlug`, `safetyIndex(locale)` (`server-only`) | Чтение как у SEO-страниц: кэш в модуле, `typeset` для русского текста, общее правило `isVisible` | SAFE-01 шаг 6 |
| `apps/web/src/features/seo-content/load.ts` | `isVisible` принимает `{ review: { status } }` | Одно правило видимости для статей и справочника | исправление по ревью |
| `packages/shared/src/safety/match.ts` | `normalizeSafetyQuery`, `matchSafety`, `SAFETY_QUERY_MAX = 80`, `SAFETY_SUGGESTIONS_MAX = 8`, собственная функция Левенштейна | Поиск по названию, alias и опечатке; подсказки в порядке: точное → начало названия → начало alias → вхождение | SAFE-01 шаги 1, 4 |
| `packages/shared/src/safety/pet-notes.ts` | `petSafetyNotes` | Аллергия — только при совпадении целым словом; хронические болезни — строка, кроме вердикта `danger` | SAFE-01 шаги 2, 4 |
| `packages/shared/src/safety/labels.ts` | `verdictLabelKey` | Подпись вердикта зависит от категории; запрещённое сочетание читается строже | SAFE-01 шаг 5 |
| `packages/shared/src/safety/index.ts`, `packages/shared/src/index.ts` | Экспорт | — | SAFE-01 |
| `apps/web/content/safety/*.json` | 12 пилотных позиций | Пилот; шесть ссылаются на страницы `/otravlenie` | SAFE-01 шаг 7 |
| `apps/web/content/README.md` | Раздел «Справочник „Можно ли“» | Таблица полей, смысл вердиктов, «расходятся источники — строже», винительный падеж в `aliases` | SAFE-01 шаг 8 |
| `apps/web/tests/unit/safety/content.test.ts`, `packages/shared/src/safety/*.test.ts` | Тесты | См. «Автоматические проверки» | SAFE-01 шаги 1, 2, 5 |

## Решения и отклонения

- `SafetyCategory` и `SafetyVerdict` объявлены в `packages/shared` строковыми объединениями, как велит бриф. После SAFE-02 их нужно заменить импортом из `@lapka/contracts`.
- Опечатка прощается, только если слова запроса и позиции совпадают по количеству, отличается ровно одно слово и в нём не меньше пяти букв с обеих сторон. После ревью добавлено требование «с обеих сторон»: «риска» не находит «Риск».
- Пометка об аллергии показывается при любом вердикте, а не только при `safe` и `caution`. При `danger` она лишняя, но не вредна.
- В `aliases` нет общих слов («обезболивающее», «сахарозаменитель»): точное совпадение должно вести к одной позиции. Правило записано в README.
- Отступлений от спеки по вердиктам нет. Спорные вердикты решены по правилу «расходятся источники или данных мало — строже»:
  - кошка + ксилит — `danger`: данных о кошках мало;
  - кошка + виноград — `danger`: в Merck только отдельные сообщения;
  - собака + лилия — `caution`/`watch`: настоящие лилии для собак неядовиты, но лилиями называют и ландыш, каллу, спатифиллум;
  - яблоко — `caution`/`watch` у обоих видов: семечки и сердцевина.
- Вторую проверку контента исполнитель сделал сам, второго агента не было. Поэтому все 12 позиций — `draft` (см. «Ошибки и повторные проверки»).

## Матрица приёмки

| ID | Критерий из плана | Способ проверки | Ожидаемый результат | Фактический результат | Статус | Запись |
| --- | --- | --- | --- | --- | --- | --- |
| SAFE-01.1 | `matchSafety` находит позицию по названию, alias и опечатке в одну букву для слов от 5 букв; пустой и неизвестный запрос дают пустой результат | `match.test.ts` | «Изюм» → `vinograd`; «шокалад» → `shokolad`; «рос» и «риска» → `null`; «шок» → `['shokolad']`; «драконий фрукт», «» и «  !! » → пусто; не больше 8 подсказок | Всё так, 254/254 в `@lapka/shared` | PASS | «Автоматические проверки», строка 1 |
| SAFE-01.2 | Пометка об аллергии — только при совпадении целым словом; пометка о хронических болезнях не появляется при `danger` | `pet-notes.test.ts` | «на курицу и говядину» → `[]`; «Курица» и «курятина, рыба» → пометка; «рис» ≠ «Барбарис»; при `danger` хронической строки нет | Всё так | PASS | «Автоматические проверки», строка 1 |
| SAFE-01.3 | Файл с `danger` + `ifEaten: "none"`, без раздела вида, без английского текста, лекарство не с `danger` или бытовое вещество с `safe` валит тест с именем файла | `content.test.ts`: `rejects …` (10 вариантов), `are named after their slug` (каждый файл отдельно, в сообщении `<file>: <ошибка>`); `allEntries` бросает `content/safety/<file>: …` | Схема отклоняет каждый вариант; сломанный файл назван | Все 10 вариантов отклонены; проверка по файлам проходит | PASS | «Автоматические проверки», строка 2 |
| SAFE-01.4 | 12 пилотных позиций проходят все тесты контента; шесть связаны со страницами `/otravlenie` и согласованы с ними | `content.test.ts` + сверка с `content/toxins/*.json` | 12 файлов зелёные; `toxinSlug` существует; вердикт по виду, описанному на странице отравления, — `danger` | 12 зелёные. `shokolad`, `vinograd` → `vinograd-izyum`, `ksilit`, `liliya`, `paracetamol`, `antifriz` ссылаются на свои страницы. У каждого вида, описанного там, здесь `danger` | PASS | «Автоматические проверки», строка 2; таблица пилота |
| SAFE-01.5 | `packages/shared` не импортирует ничего из `apps/*`, `next`, `node:*` | `grep -rnE "from ['\"](next\|node:\|@/\|\.\./\.\./\.\./apps)" packages/shared/src/safety` и `tsc` с `"types": []` | Пусто; typecheck зелёный | Пусто; `npm run typecheck` exit 0 | PASS | «Автоматические проверки», строки 3–4 |

## Автоматические проверки

| Набор / назначение | Точная команда и рабочий каталог | Ревизия | Exit code | Passed / failed / skipped | Лог |
| --- | --- | --- | --- | --- | --- |
| Поиск, пометки, подписи и весь `@lapka/shared` | `npm run test --workspace @lapka/shared` (корень worktree) | `f0fc4ed` | 0 | 254 / 0 / 0, 25 файлов | `Test Files 25 passed (25)`, `Tests 254 passed (254)` |
| Контент справочника и SEO-страниц | `npx vitest run tests/unit/safety tests/unit/seo-content` (`apps/web`) | `f0fc4ed` | 0 | 34 / 0 / 0, 4 файла | `Test Files 4 passed (4)`, `Tests 34 passed (34)` |
| Типы | `npm run typecheck` (корень worktree) | `f0fc4ed` | 0 | — | 0 ошибок |
| Линтер | `npm run lint` (корень worktree) | `f0fc4ed` | 0 | — | 0 ошибок; старые предупреждения в чужих файлах |
| Полный набор | `npm run test` (корень worktree) | `a5b35fc` | 0 | shared 253, web 581, mobile 787; 0 failed | до исправлений по ревью; на `f0fc4ed` прогнаны затронутые наборы (строки 1–2) |

TDD:
- **RED (shared).** `npm run test --workspace @lapka/shared -- src/safety` → `Test Files 3 failed (3)`, `Error: Cannot find module './pet-notes'` (и `./match`, `./labels`): модулей ещё не было.
- **GREEN (shared).** `Tests 21 passed (21)`.
- **RED (web).** `npx vitest run tests/unit/safety` → ошибка импорта `@/features/safety/load`. Потом, со схемой и загрузчиком, но без контента: 21 passed, 2 failed — индекс и `entryBySlug`, позиций ещё не было.
- **GREEN (web).** После контента — `Tests 23 passed (23)`.

Моков нет, кроме `server-only` (заглушка из `vitest.config`). Тесты загрузчика читают настоящие файлы `content/safety/`. Видимость черновиков проверяется через `vi.stubEnv` (`VERCEL_ENV=preview` / `production`). Тесты не проверяют достоверность медицинского содержания — это ручная проверка по источникам (ниже) и два круга SAFE-06.

## Ручные проверки

Сверка пилотных позиций с первичными источниками. Исполнитель — Claude (тот же агент, что писал черновик), 13 ноября 2026. Страницы открывались через WebFetch. `url` в `sources` стоит только у открытых страниц; у остальных источников — только название.

| Позиция | Категория | Кошка | Собака | Источники | Сверено |
| --- | --- | --- | --- | --- | --- |
| `shokolad` → `/otravlenie/shokolad` | food | danger | danger | ASPCA People Foods to Avoid (url); MSD — отравление шоколадом (название) | Страница ASPCA |
| `vinograd` → `/otravlenie/vinograd-izyum` | food | danger | danger | Merck — Grape, Raisin, and Tamarind Toxicosis in Dogs (url); ASPCA People Foods (url) | Обе страницы; у кошек только отдельные сообщения → строже |
| `luk-chesnok` | food | danger | danger | ASPCA People Foods (url); MSD — отравление луком и чесноком (название) | Страница ASPCA: кошки чувствительнее |
| `ksilit` → `/otravlenie/ksilit` | food | danger | danger | Pet Poison Helpline — Xylitol (url); ASPCA People Foods (url) | Обе страницы; о кошках данных нет → строже |
| `liliya` → `/otravlenie/liliya` | plant | danger | caution | ASPCA — Easter Lily (url); MSD — отравление лилиями у кошек (название) | Страница ASPCA: пострадать могут только кошки |
| `ibuprofen` | medicine | danger | danger | Pet Poison Helpline — Ibuprofen (url); MSD — отравления обезболивающими для людей (название) | Страница PPH; чувствительность кошек — по поиску (dvm360) |
| `paracetamol` → `/otravlenie/paracetamol` | medicine | danger | danger | Pet Poison Helpline — Acetaminophen (url); MSD — отравления обезболивающими для людей (название) | Страница PPH |
| `antifriz` → `/otravlenie/antifriz` | household | danger | danger | Pet Poison Helpline — Antifreeze Poisoning in Dogs & Cats (название); MSD — отравление этиленгликолем (название) | Только по выдаче поиска, страница не открыта |
| `morkov` | food | safe | safe | ASPCA — Carrot Flower, *Daucus carota var. sativa* (url) | Страница: неядовита, корнеплод съедобен |
| `yabloko` | food | caution | caution | ASPCA — Apple (url) | Страница: цианогенные гликозиды в черенках, листьях, семенах |
| `moloko` | food | caution | caution | ASPCA People Foods (url) | Страница: мало лактазы |
| `hlorofitum` | plant | safe | safe | ASPCA — Spider Plant (url) | Страница: неядовит для кошек и собак |

Статус: PASS как черновая сверка. Это не та проверка «вторым агентом», которую требует процесс; она остаётся за SAFE-06.

## Ошибки и повторные проверки

| Дефект / исходный сбой | Воспроизведение и первая запись | Причина / исправление | Повторная запись и результат | Остаточные ограничения |
| --- | --- | --- | --- | --- |
| `@lapka/shared` в тестах сайта отдавал `undefined` (`TypeError: undefined is not a function` в `content.test.ts`) | `npx vitest run tests/unit/safety` до коммита `a5b35fc` | В worktree не было `node_modules`, пакет брался из основной копии без новых экспортов. Добавлены неотслеживаемые симлинки `node_modules/@lapka/*` на пакеты worktree, а также `apps/mobile/node_modules` и `packages/contracts/node_modules` на основную копию (иначе `expo-router` не находился в typecheck и lint мобильного приложения) | `Tests 23 passed (23)`; typecheck и lint — exit 0 | Симлинки не закоммичены; `git add -A` не использовать |
| Проверка фразы про рвоту падала на `antifriz` | `content.test.ts`, «mention making a pet vomit…» | `typeset` ставит неразрывные пробелы; регулярное выражение переписано на `\s+` | Зелёное | — |
| Ревью `a5b35fc`, важное: 11 позиций с `agent_reviewed` и `reviewedBy: "agent"` без проверки вторым агентом | Ревью контролёра | Все 12 возвращены в `{ "status": "draft", "draftedBy": "model" }` (`f0fc4ed`) | `content.test.ts` зелёный | Проверка — в SAFE-06 |
| Ревью `a5b35fc`, мелкие: копия `isVisible`; проверка лимита `≤ 8` вместо `= 8`; сортировка без `'ru'`; опечатка по четырёхбуквенному слову; запятая в двух лекарствах; нет сверки длины списков ru/en | Ревью контролёра | `isVisible` общий; `toHaveLength(8)`; `localeCompare(…, 'ru')`; пять букв с обеих сторон и тест «риска» ≠ «Риск»; запятая добавлена; тест на одинаковое число `signs`, `firstSteps` и `avoid` в ru и en | shared 254/254, web safety + seo-content 34/34, typecheck и lint — exit 0 | — |

## Непроверенное и риски

- **Все 12 позиций — `draft`.** Production их не покажет (`isVisible`). Публикация — после двух кругов агентской проверки в SAFE-06 и решения владельца. Приёмку SAFE-01 это не блокирует: этап требует схему, правила и проходящий тесты пилот, а не опубликованный контент.
- **`\p{L}` в Hermes.** `normalizeSafetyQuery` использует `/[^\p{L}\p{N}]+/gu`. Node его понимает; поддержку Unicode property escapes в Hermes нужно проверить в SAFE-04 на устройстве или в симуляторе. Если не поддерживается — заменить явным набором букв.
- **Общие alias у ксилита.** «жвачка», «жвачку», «жевательная резинка», “gum”, “chewing gum” ведут точно на ксилит, хотя не всякая жвачка его содержит. Пересмотреть в SAFE-06: оставить как строгий вариант или убрать.
- **Достоверность.** Ветеринар справочник не видел. Источники MSD указаны по названию, их страницы не открывались. `antifriz` сверен только по выдаче поиска.
- **Полный `npm run test` на `f0fc4ed` не перезапускался.** Прогнаны затронутые наборы, typecheck и lint. Полный прогон зелёный на `a5b35fc`.

## Итог и следующий шаг

PASS 5, FAIL 0, NOT RUN 0. Статус ACCEPTED: все пять критериев SAFE-01 подтверждены тестами на `f0fc4ed`, ревью закрыто. Контент остаётся черновым.

Следующий шаг — SAFE-02: контракт `packages/contracts/src/safety.ts`, перенос `SafetyCategory` и `SafetyVerdict` в контракт, маршруты `GET /api/v1/safety/index` и `GET /api/v1/safety/items/{slug}`.

## История проверок

- 13 ноября 2026, `a5b35fc`: RED/GREEN по шагам брифа; полный `npm run typecheck && npm run lint && npm run test` — exit 0 (shared 253, web 581, mobile 787). Запись — `.superpowers/sdd/2026-11-13-pet-safety/task-1-report.md`.
- 13 ноября 2026: ревью контролёра — «Needs fixes» (1 важное, 6 мелких).
- 13 ноября 2026, `f0fc4ed`: исправления. shared 254/254, web safety + seo-content 34/34, typecheck и lint — exit 0. Запись — тот же файл, раздел «Fix round 1».
- 13 ноября 2026: повторное ревью — все замечания закрыты.
