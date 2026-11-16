# SAFE-02: справочник «Можно ли» — контракт и API

Отчёт о втором этапе функции «Можно ли это питомцу»: справочник отдаётся через v1 API и общий клиент.

## Паспорт

| Поле | Значение |
| --- | --- |
| Этап и название | SAFE-02 — контракт и API: индекс и позиция |
| Статус | ACCEPTED (контент — черновики, см. «Непроверенное и риски») |
| Даты работы | 13 ноября 2026, Europe/Moscow |
| Версия плана | [Спека](../superpowers/specs/2026-11-13-pet-safety-design.md), [план](../superpowers/plans/2026-11-13-pet-safety.md), бриф Task 2 из `.superpowers/sdd/2026-11-13-pet-safety/` |
| Проверенный код | `79a3ce3` на ветке `claude/can-pet-eat-f35f72` |
| PR / коммиты | PR не создан. `79a3ce3` API: pet safety reference — index and item routes |
| Окружение | Локальное: Node v25.2.1, Next.js 16.4.3, vitest 4.1.11, TypeScript ~6.0.3; общий локальный Supabase (`apps/web/.env.integration`) |
| Сборки | `next build --webpack` в `apps/web`, локально (см. «Ошибки и повторные проверки» — почему не Turbopack). Мобильных сборок этап не касается |

## Что сделано

До этапа справочник читали только тесты. Теперь его отдают два маршрута v1 под `withApiAuth`, на языке аккаунта, по схемам контракта. С `pet_id` своего питомца позиция открывается разделом его вида и несёт пометки из анкеты. Чужой или удалённый питомец — `not_found`.

| Файл или компонент | Что изменено | Зачем | ID пункта плана |
| --- | --- | --- | --- |
| `packages/contracts/src/safety.ts`, `index.ts` | Перечисления категорий, вердиктов, `if_eaten`; `SAFETY_QUERY_MAX`; `SafetyIndexSchema`, `SafetySpeciesSectionSchema`, `SafetyPetNoteSchema`, `SafetyItemSchema` (не strict) | Единственный источник формы ответа; поле, добавленное новым сервером, не роняет старое приложение | SAFE-02 шаг 3 |
| `apps/web/src/server/safety/safety-service.ts` | `getSafetyIndex(locale)`, `getSafetyItem(supabase, { userId, slug, petId, locale })` | Позиция через `entryBySlug` (правило `isVisible`), питомец — `id` + `user_id` + `deleted_at is null`; пометки — `petSafetyNotes` для вида питомца | SAFE-02 шаг 3 |
| `apps/web/src/app/(backend)/api/v1/safety/index/route.ts`, `…/items/[slug]/route.ts` | Маршруты `GET` | По образцу `health/catalog`; `pet_id` не UUID — 400 `bad_request` | SAFE-02 шаг 3 |
| `packages/shared/src/api-client.ts` | `getSafetyIndex()`, `getSafetyItem(slug, petId?)` | Клиент для приложения | SAFE-02 шаг 3 |
| `packages/shared/src/safety/{match,pet-notes,labels}.ts`, `apps/web/src/features/safety/{schema,load}.ts` | Типы и перечисления — из `@lapka/contracts`; локальные объявления убраны | Что может сказать файл — то и может отдать API | SAFE-02 шаг 3 |
| `apps/web/next.config.ts` | `outputFileTracingIncludes: { '/api/v1/safety/**': ['./content/safety/**/*.json'] }` | Файлы справочника в функции маршрутов | SAFE-02 шаг 4 |
| `packages/contracts/src/openapi.ts`, `docs/api/openapi.yaml` | Пути `/safety/index`, `/safety/items/{slug}`, компоненты `SafetyIndex`, `SafetyItem` | OpenAPI | SAFE-02 шаг 5 |
| `apps/web/tests/server/architecture/service-boundaries.test.ts` | Исключение для `@/features/safety/{load,schema}` | См. «Решения и отклонения» | — |
| `apps/web/tests/integration/safety-02.test.ts`, `packages/shared/src/api-client.test.ts`, `apps/web/tests/unit/contracts/openapi.test.ts` | Тесты | См. «Автоматические проверки» | SAFE-02 шаги 1, 5 |

## Решения и отклонения

- **Граница сервисов.** Архитектурный тест запрещает `src/server/**` импортировать `@/features/**` («экран»). Бриф кладёт сервис в `src/server/safety/`, а загрузчик (Task 1) — в `src/features/safety/`. Загрузчик и схема — данные, а не экран: тест получил узкое исключение для `@/features/safety/load` и `@/features/safety/schema`. Остальные модули `features` по-прежнему запрещены.
- **Тест «черновик не виден в production».** Бриф предлагает подменить `allEntries` через `vi.mock`, но `visibleEntries`, `entryBySlug` и `safetyIndex` вызывают её внутри модуля, и подмена экспорта до них не доходит. Подменены файлы (`vi.doMock('node:fs')` + `vi.resetModules()`): опубликованная копия моркови и черновик шоколада читаются настоящим загрузчиком. Индекс — только `morkov`, `items/shokolad` — 404.
- **Раздел вида первым.** В JSON ключ вида питомца идёт первым в `by_species`. Zod при разборе восстанавливает порядок схемы, поэтому клиент упорядочивает по `pet.species`. Тест проверяет порядок в сыром ответе.
- **Аллергия — на обоих языках.** Строка из анкеты сверяется с названием и alias позиции на языке аккаунта и на втором языке: владелец пишет аллергию на том языке, на каком хочет.
- **Удалённый питомец** проверен на собственном удалённом питомце владельца B (`PET_IDS.bDeleted`): у фикстур у владельца A удалённого нет.
- **«Три пути» в плане.** Добавлены два; третий, `POST /safety/ask`, — Task 3 (SAFE-03), там же меняется `openapi.ts`.
- `pet_notes` по брифу: аллергия `['курица']`, хронические `['ХБП']` выставляются собаке A и возвращаются к значениям фикстур в `afterAll`.

## Матрица приёмки

| ID | Критерий из плана | Способ проверки | Ожидаемый результат | Фактический результат | Статус | Запись |
| --- | --- | --- | --- | --- | --- | --- |
| SAFE-02.1 | Индекс и позиция отдаются на языке аккаунта и проходят схемы контракта | `safety-02.test.ts`: «serves the index in the account’s language…», «serves an entry without a pet…», «puts the pet’s species first…» | Индекс A (ru) проходит `SafetyIndexSchema`, `shokolad.verdict.dog = danger`, название «Шоколад»; у B (en) — “Chocolate”; позиция проходит `SafetyItemSchema` на обоих языках | Так | PASS | «Автоматические проверки», строка 1 |
| SAFE-02.2 | Чужой или удалённый питомец в `pet_id` — `not_found`; пометки чужого питомца получить нельзя | «answers someone else’s pet and a deleted one as missing» | `shokolad?pet_id=<кошка B>` токеном A → 404 `not_found`; удалённый питомец B токеном B → 404 `not_found` | Так; сервис не читает анкету, пока питомец не найден у вызывающего | PASS | строка 1 |
| SAFE-02.3 | Без токена оба маршрута — 401 | «refuses both routes without a token» | 401 у `index` и у `items/shokolad` | Так | PASS | строка 1 |
| SAFE-02.4 | Черновик не виден API в production-режиме | `describe('production')`: `NODE_ENV=production`, `VERCEL_ENV` снят, подмена файлов | Индекс — `['morkov']`; `items/shokolad` (draft) — 404 `not_found`; `items/morkov` — 200 | Так | PASS | строка 1 |
| SAFE-02.5 | В production-сборке маршруты читают файлы справочника (есть в трассировке), `openapi.yaml` обновлён | `next build --webpack`; `grep content/safety` в `route.js.nft.json`; `openapi.test.ts` | Все 12 файлов в трассировке обоих маршрутов; документ совпадает со сгенерированным и проходит валидатор | 12/12 в `safety/index` и `safety/items/[slug]`, 0 у `health/catalog`; `openapi.test.ts` 7/7 | PASS | строки 4–5 |

Прочие случаи брифа: `items/morkov?pet_id=<собака A>` → `pet_notes = [{ kind: 'chronic' }]` («курица» не морковь); у шоколада (`danger`) хронической строки нет; `items/net-takogo` → 404; `pet_id=не-uuid` → 400 `bad_request`.

## Автоматические проверки

| Набор / назначение | Точная команда и рабочий каталог | Ревизия | Exit code | Passed / failed / skipped | Лог |
| --- | --- | --- | --- | --- | --- |
| Интеграция (настоящий локальный Supabase), весь набор | `npm run test:integration` (корень worktree) | `79a3ce3` (до коммита, то же дерево) | 0 | 576 / 0 / 0, 55 файлов; из них `safety-02` — 8 | `Test Files 55 passed (55)`, `Tests 576 passed (576)` |
| Модульные, все рабочие области | `npm run test` (корень worktree) | то же | 0 | 581 + 788 + 257 (shared), 0 failed | три строки `Tests … passed` |
| Типы, линтер | `npm run typecheck`, `npm run lint` (корень) | то же | 0 / 0 | — | 0 ошибок; 49 старых предупреждений в чужих файлах |
| Production-сборка | `npx next build --webpack` (`apps/web`) | то же | 0 | — | маршруты `ƒ /api/v1/safety/index`, `ƒ /api/v1/safety/items/[slug]` |
| Трассировка | `grep -o 'content/safety/[^"]*\.json' '.next/server/app/(backend)/api/v1/safety/{index,items/[slug]}/route.js.nft.json'` | то же | — | 12 и 12 файлов | у `health/catalog` — 0 |

TDD:
- **RED (интеграция).** `npx vitest run --config vitest.integration.config.mts safety-02` (`apps/web`) → `Error: Cannot find package '@/app/(backend)/api/v1/safety/index/route'`: маршрутов ещё не было.
- **RED (клиент).** `npx vitest run src/api-client.test.ts` (`packages/shared`) → `Tests 3 failed | 20 passed (23)`: методов `getSafetyIndex`/`getSafetyItem` не было.
- **GREEN.** Клиент — `Tests 23 passed (23)`; интеграция — `Tests 8 passed (8)` (после одной правки теста: порядок ключей проверяется в сыром ответе).

Моки: `server-only` (заглушка), в одном `describe` — `node:fs` для каталога `content/safety`. База, авторизация и маршруты — настоящие. Тесты не проверяют работу под Turbopack на Vercel (см. ниже) и медицинское содержание.

## Ручные проверки

Неприменимо: этап — API без интерфейса; всё проверено автоматически.

## Ошибки и повторные проверки

| Дефект / исходный сбой | Воспроизведение и первая запись | Причина / исправление | Повторная запись и результат | Остаточные ограничения |
| --- | --- | --- | --- | --- |
| Архитектурный тест: `safety/safety-service.ts imports a screen` | `npm run test` | Сервис импортирует загрузчик из `features/safety`; узкое исключение в тесте | `npm run test` exit 0 | — |
| `openapi.test.ts › is accepted by an OpenAPI validator` — таймаут 5000 мс | Первый `npm run test`, под нагрузкой | Отдельно проходит за ~200 мс; при повторном полном прогоне зелёный | exit 0 | Нестабилен под нагрузкой, не связан с этапом |
| `npm run build` (Turbopack): `Could not find the Next.js package (next/package.json)` | `npm run build` в worktree | В worktree нет своего `node_modules`; зависимости берутся из основной копии выше корня, а Turbopack не компилирует файлы вне корня (симлинки тоже не помогли, удалены). Сборка выполнена `next build --webpack` | exit 0, трассировка проверена | Turbopack-сборка с этой веткой — на Vercel preview или после `npm install` в чистой копии |
| Контрольная сборка без `outputFileTracingIncludes` | ключ временно заменён на несуществующий маршрут, `next build --webpack` | Webpack-трассировщик и сам находит `content/safety/*.json` по `join(process.cwd(), 'content')` | 12 файлов и без настройки | Настройка оставлена как гарантия для Turbopack, где трассировка своя |

## Непроверенное и риски

- **Все 12 позиций — `draft`.** Production API отдаёт пустой индекс, пока SAFE-06 и владелец их не опубликуют. Тест production-правила использует подменённые файлы.
- **Turbopack на Vercel.** Трассировка проверена webpack-сборкой. В Turbopack-сборке (production на Vercel) её нужно посмотреть на preview-деплое: маршрут `GET /api/v1/safety/index` должен ответить 200, а не 500.
- Владелец A после интеграционных тестов может остаться в `deleting` — известное свойство общего стека, не этого этапа.

## Итог и следующий шаг

PASS 5, FAIL 0, NOT RUN 0. Статус ACCEPTED: все пять критериев SAFE-02 подтверждены на `79a3ce3`.

Следующий шаг — SAFE-03: `POST /api/v1/safety/ask`, миграция `safety_ai_answers`, лимит `safety_ask`.

## История проверок

- 13 ноября 2026, дерево `79a3ce3`: RED/GREEN по шагам брифа; `npm run typecheck && npm run lint && npm run test && npm run test:integration` — exit 0; `next build --webpack` и трассировка. Запись — `.superpowers/sdd/2026-11-13-pet-safety/task-2-report.md`.
