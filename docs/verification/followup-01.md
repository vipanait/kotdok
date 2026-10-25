# FU-01. Случай, правила и API (вместе с серверной частью FU-03 и SQL FU-04)

| Поле | Значение |
| --- | --- |
| Статус | IN_PROGRESS — реализовано и проверено на локальной базе; миграции в прод не применялись |
| Дата | 25 октября 2026 |
| План | [plans/followup-loop/README.md](../plans/followup-loop/README.md) |
| Ветка | `claude/followup-loop-plan-303d94`: `07c26ce` (удаление аккаунта), `513baa2` (FU-01), `ad2680b` (FU-03 сервер), `6194f1b` |
| Окружение | Локальный Supabase (`supabase db reset --workdir .`), Node 25, Vitest 4.1 |

## Что сделано

| Часть | Изменение | ID |
| --- | --- | --- |
| `supabase/migrations/20261025120000_followup_cases.sql` | `followup_cases`, `followup_case_checks`, `followup_checkins`; только сервер (RLS без политик, права отозваны), `refuse_late_writes`, все ключи каскадные; один открытый случай на питомца (частичный уникальный индекс); функции `set_followup_enabled`, `record_followup_checkin` (идемпотентность, защита от гонки по `updated_at`), `link_followup_recheck`, `expire_followup_cases`, `admin_followup_statistics`; закрытие случая мягко удалённого питомца | FU-01.2–5, 7; FU-04 |
| `packages/shared/src/followup/rules.ts` | Расписание по срочности, тихие часы 21–09, решение по ответу, досрочный ответ, второе «ещё нет» | FU-01.1 |
| `packages/contracts/src/followup.ts`, `check.ts`, `openapi.ts` | Схемы случая, отметки, предложения; `followup` у проверки только с признаком `followup` в `X-Lapka-Features`; 9 путей в OpenAPI | FU-01.6, 8 |
| `apps/web/src/server/followup/followup-service.ts`, маршруты `v1/checks/[id]/followup`, `v1/followups/**`, `v1/pets/[id]/health/episodes`, `cron/followup-expiry` | Сервис и адаптеры; лимит `followup_write` 60 в час | FU-01.2–7 |
| `analyze-symptom-check.ts`, `check-job-service.ts`, `symptom-check-http.ts`, `CheckCreateInputSchema.followup_case_id` | Повторная проверка: случай проверяется до списания, прошлая проверка и отметки — в промпте как данные в кавычках (до 1500 символов), результат присоединяется к случаю и перезапускает расписание | FU-03.1–5 |
| `supabase/migrations/20261025110000_delete_account_with_linked_visits.sql` | Исправление прод-ошибки: аккаунт с визитом, записанным из результата проверки, не удалялся (`SET NULL` → UPDATE → `refuse_late_writes`). Медкарта теперь удаляется до проверок | Риск 4 плана |

## Матрица приёмки

| ID | Проверка | Результат | Статус |
| --- | --- | --- | --- |
| FU-01.1 | `packages/shared/src/followup/rules.test.ts` | 27/27 | PASS |
| FU-01.2 | `followup-01.test.ts`: предложение monitor 12/48 ч, urgent выключено, healthy / без питомца / старше 12 ч — нет и 409; три параллельных включения — один случай; `superseded` | 6/6 | PASS |
| FU-01.3 | Повтор ключа 201→200, одна строка; вопрос о визите обязателен и запрещён вне него; закрытый — 409; «так же» после 48 ч — `final` / `see_vet` | 4/4 | PASS |
| FU-01.4 | Второй пользователь — 404 на всех маршрутах; таблицы не читаются токеном пользователя | 2/2 | PASS |
| FU-01.5 | Удаление аккаунта с открытым случаем, отметкой и визитом из проверки; мягкое удаление питомца → `pet_deleted` | 2/2 (до `07c26ce` первый падал: «account is not accepting writes») | PASS |
| FU-01.6 | Без признака ответы `GET /checks` и `GET /checks/{id}` без `followup`; с признаком — есть | 1/1 | PASS |
| FU-01.7 | Cron закрывает случай через 7 дней как `expired`; без секрета — 401 | 1/1 | PASS |
| FU-01.8 | `tests/unit/contracts` (снапшот OpenAPI, список путей), `schema.test.ts` (таблицы и функции) | 87/87, schema — PASS | PASS |
| FU-03.1 | `followup-03.test.ts`: списывается ровно одна проверка; ошибка модели — возврат; чужой питомец — 409 без списания и без вызова модели | 3/3 | PASS |
| FU-03.2 | Блок `PREVIOUS CHECK` в промпте, заметка с «инструкцией» и U+2028 — одна строка в кавычках; правило в системном промпте | 1/1 | PASS |
| FU-03.3 | Повторная проверка присоединена, план перезапущен (urgent → вопрос о визите); `healthy` закрывает как `improved` | 2/2 | PASS |
| FU-03.4 | Ноль проверок → запрос дополнительной (интерфейс) | Проверено в коде приложения; сайт — в отчёте веба | — |
| FU-03.5 | Без случая проверка как раньше; MR-10 и `check-jobs` зелёные | 2 файла | PASS |
| FU-04 (SQL) | `admin_followup_statistics` на тестовых данных: предложено/включено/ответили/первый ответ/эскалация/источник | 1/1 | PASS |

## Команды

| Команда (корень репозитория) | Результат |
| --- | --- |
| `npm run typecheck` в `contracts`, `shared`, `web`, `mobile` | 0 ошибок |
| `npm run test --workspace=@lapka/shared` | 16 файлов, 194 теста |
| `npm run test --workspace=@lapka/web` | 74 файла, 641 тест |
| `cd apps/web && npx vitest run --config vitest.integration.config.mts tests/integration/followup-01.test.ts tests/integration/followup-03.test.ts tests/integration/deletion-worker-sql.test.ts tests/integration/schema.test.ts tests/integration/check-jobs.test.ts tests/integration/medical-record-10.test.ts` | все прошли |

Полный интеграционный набор `npm run test:integration --workspace=@lapka/web` после всех изменений ветки: 52 файла, 523 теста, все прошли (25 октября, 13:11).

## Ревью PR #89 (25 октября, после открытия)

Десять находок, все исправлены в ветке:

1. Телефон планирует все оставшиеся вопросы случая, а не только ближайший: вопрос через 48 ч прозвенит, даже если первый проигнорировали (`followup-reminders.ts`, в сводку случая добавлено `anchor_at`).
2. Хронология в приложении показывает у визита только день, без выдуманного «12:00».
3. Выключение напоминания сохраняет ожидаемый вопрос; повторное включение продолжает с него, с той же эскалацией (`set_followup_enabled`, тест `followup-01.test.ts`).
4. Метрика «повторные проверки (срочнее)» считает только те, где уровень вырос против исходного.
5. Приложение снимает связь со случаем после 409 на повторную проверку и объясняет это (`recheckRefused`).
6. «Все случаи · N» на сайте раскрывает N перенесённых случаев на месте, а не ведёт в историю проверок.
7. `quotedOwnerText` — одна функция экранирования владельческого текста для промпта (`analysis-context.ts`), сервис наблюдения её переиспользует.
8. `tomorrowMorning`, `isDue`, `dueCases` — в `packages/shared/src/followup/due.ts`, оба клиента берут оттуда.
9. `storedCheckin` возвращает плоский результат; мёртвая ветка `status === 'off'` убрана.
10. Экран результата не запрашивает наблюдение для `healthy` и проверок без питомца; `getCheckFollowup` читает случай проверки и открытый случай питомца параллельно.

Проверка «Все случаи» в браузере сначала не удалась: медкарта в панели браузера висела на скелетоне. Позже причина найдена — скрытая панель не рисует кадры, и гидрация React ждёт `requestAnimationFrame` (см. [followup-loop-e2e.md](followup-loop-e2e.md)); после отрисовки кадра «Все случаи · 4» проверены в браузере. Поведение закреплено и компонентным тестом в `followup-screens.test.tsx`.

## Что не сделано и ограничения

- Миграции `20261025110000` и `20261025120000` не применены ни к staging, ни к проду: прод — решение владельца (`supabase db push`).
- Исправление удаления аккаунта нужно в проде независимо от фичи: сейчас такие аккаунты не удаляются. Миграция `20261025110000` меняет порядок удаления и возвращает в работу задачи, которые уже сдались на шаге `data` (`reopen_stuck_data_deletions()`, тест в `deletion-worker-sql.test.ts`). После `db push` ежедневный cron (03:00 UTC) доделает их сам.
- Тексты решений (`decision.*`) не просмотрены ветеринаром — открытый вопрос 1 плана.
