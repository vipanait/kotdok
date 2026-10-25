# Цикл наблюдения после проверки: итерационный план реализации

> Для исполняющего агента: использовать `superpowers:executing-plans` и выполнять один выбранный этап за раз. Этот документ — план, а не разрешение реализовать сразу все этапы.

**Цель:** проверка симптомов не заканчивается на результате. Приложение спрашивает, как питомец через несколько часов или дней, и по правилу без модели закрывает случай, просит наблюдать дальше или отправляет к врачу. Мы узнаём, что стало с питомцем после проверки.

**Архитектура:** «случай» хранится на сервере: исходная проверка, расписание отметок, ответы, повторные проверки. Правила эскалации и расписание — чистые функции в `packages/shared`, их считают и сервер, и клиенты. Телефон ставит локальные уведомления из серверного списка открытых случаев тем же планировщиком, что и напоминания медкарты, поэтому они переживают переустановку и смену устройства. На сайте вместо уведомления — баннер на главной. Серверных push нет.

**Стек:** существующие npm workspaces `apps/web`, `apps/mobile`, `packages/contracts`, `packages/shared`, Supabase. Новых зависимостей и нативных модулей нет.

**Дизайн:** [задание дизайнеру](../../agent-instructions/2026-10-25-followup-loop-design.md), результат — `docs/design/followup-loop-v1/` (ещё не создан). Действующие спецификации: [mobile-design-spec.md](../../design/mobile-design-spec.md), [web-design-spec.md](../../design/web-design-spec.md), [web-update-2026-10-20](../../design/web-update-2026-10-20/README.md).

## Решения владельца (25 октября 2026)

1. Напоминание включено по умолчанию для `monitor` и `home_care`. Для `urgent` и `emergency` его предлагаем, но не включаем: на этих экранах главное — «к врачу». Для `healthy` напоминания нет.
2. Фото в отметках — отдельным этапом FU-08: приватный бакет Supabase, как у аватаров питомца, с правкой политики. Первая версия без фото.
3. «Записать в медкарту» после ответа «Лучше» — новый блок «Перенесённые случаи» в карточке питомца и в сводке для врача.
4. Первыми выходят сервер и веб: они уходят в прод со слиянием в main. Мобильная часть — со следующей пачкой релиза по решению владельца.
5. Бесплатных вызовов модели нет. Повторная проверка с учётом прошлой списывает одну проверку, как обычная.

## Порядок

| Этап | Функция | Зависимости | Ждёт дизайна | Отчёт |
|---|---|---|---|---|
| [FU-01](#fu-01-случай-правила-и-api) | Случай, правила и API | Нет | Нет | `docs/verification/followup-01.md` |
| [FU-02](#fu-02-веб-предложение-баннер-отметка) | Веб: предложение, баннер, отметка | 01 | **Да**: В-1, В-2, В-3 | `followup-02.md` |
| [FU-03](#fu-03-повторная-проверка-с-учётом-прошлой) | Повторная проверка с учётом прошлой | 01; веб-часть после 02 | Частично: М-8 (на вебе — та же плашка) | `followup-03.md` |
| [FU-04](#fu-04-метрики-в-админской-статистике) | Метрики в админской статистике | 01 | Нет | `followup-04.md` |
| [FU-05](#fu-05-мобильный-предложение-и-уведомления) | Мобильный: предложение и уведомления | 01 | **Да**: М-1, М-2, М-3, М-6 | `followup-05.md` |
| [FU-06](#fu-06-мобильный-отметка-и-что-дальше) | Мобильный: отметка и «что дальше» | 05; 03 для кнопки повторной проверки | **Да**: М-4, М-5, М-8 | `followup-06.md` |
| [FU-07](#fu-07-хронология-и-перенесённые-случаи) | Хронология и «Перенесённые случаи» (оба клиента) | 02, 06 | **Да**: М-7, М-9, В-4, В-5 | `followup-07.md` |
| [FU-08](#fu-08-фото-в-отметках) | Фото в отметках и сравнение по дням | 07 | **Да**: фото-варианты М-4, М-7 | `followup-08.md` |
| [FU-09](#fu-09-общая-приёмка-и-мобильный-выпуск) | Общая приёмка и мобильный выпуск | 01–07 (08 — по решению) | Нет | `followup-09.md` |

FU-01 и FU-04 можно делать, пока дизайнер рисует. FU-02 и FU-05 начинаются после макетов. Без макетов агент реализует только серверную часть и логику, не придумывая экраны.

## Правило одной итерации

1. Передать агенту этот документ и указать один этап.
2. Агент изучает актуальные исходники, реализует этап вместе с нужными сервером и контрактами и выполняет его тесты.
3. Показывает работающий сценарий, изменения, ограничения и отчёт с нумерованными критериями.
4. Владелец принимает этап или возвращает замечания. Следующий этап передаётся отдельно.

Каждый этап — отдельный PR. Возможности ещё не сделанных этапов скрыты: нет кнопки «Проверить снова», пока нет FU-03; нет «Записать в медкарту», пока нет FU-07. На их месте ничего не имитируется.

## Общие ограничения

- `packages/*` переносимы: без Next.js, серверных SDK и DOM. В `apps/web` перед кодом читать `node_modules/next/dist/docs/` и `apps/web/AGENTS.md`.
- Старые сборки приложения продолжают работать. `SymptomCheckRecordSchema` строгая: установленные сборки отвергают незнакомые ключи. Новые поля в существующих ответах отдаются только клиенту с признаком `followup` в `X-Lapka-Features`. Остальное — новые эндпоинты, которые старые сборки не вызывают.
- Слияние в main деплоит прод. Миграцию в прод применяет владелец (`supabase db push`), агент только готовит её и проверяет на локальной базе. `supabase config push` не выполнять.
- Мобильную часть сливать без EAS Update: выпуск пачкой по решению владельца.
- Модель вызывается только при обычной платной проверке. Правила, тексты итогов и статистика модель не используют.
- Тексты итогов фиксированные и спокойные, без диагнозов. Тексты уровней срочности и дисклеймер не менять.
- Миграции и интеграционные тесты — на изолированной локальной базе (`apps/web/tests/support/db-guard.ts`), не на production.
- Этап не закрывается без `docs/verification/followup-NN.md` по [шаблону](../../verification/REPORT_TEMPLATE.md) и строки в `docs/verification/README.md`.

## Расписание и правила

### Когда спрашиваем

Чистая функция `planFor(urgency)` в `packages/shared/src/followup/plan.ts`. Отсчёт идёт от `symptom_checks.created_at`:

| Срочность | План | Слоты | По умолчанию | Почему так |
|---|---|---|---|---|
| `monitor` | `watch` | `mid` +12 ч, `final` +48 ч | включено | Действие уровня — «Наблюдайте 48 часов, при ухудшении — к врачу». 12 ч ловит ухудшение в первые сутки, 48 ч — граница самого обещания. |
| `home_care` | `watch` | `mid` +24 ч, `final` +72 ч | включено | Домашний уход обычно оценивают через сутки. Трое суток без улучшения — повод к врачу. |
| `urgent` | `vet` | `vet` +24 ч | выключено | «К ветеринару в течение 24 часов»: на следующий день спрашиваем, были ли у врача. |
| `emergency` | `vet` | `vet` +24 ч | выключено | Визит уже должен был состояться. Спрашиваем, что сказал врач. |
| `healthy` | — | — | не предлагаем | Наблюдать нечего. |

- **Тихие часы.** Момент уведомления, попавший на 21:00–09:00 по часам телефона, переносится на ближайшие 09:00. Перенос считает функция `fireMoment(dueAt, timeZone)`. Сервер хранит номинальное `due_at`. Баннер на сайте появляется, когда `now >= due_at`.
- **Срок предложения.** Блок «Напомнить» показывается только у проверки младше 12 часов, где есть `pet_id` и уровень не `healthy`. Старую проверку из истории задним числом наблюдать не предлагаем.
- **Один открытый случай на питомца.** Включение наблюдения по новой проверке закрывает прежний случай с исходом `superseded`. Это же ограничивает число уведомлений: не больше одного на питомца.
- **Без ответа.** Через 7 дней после последнего слота случай закрывается с исходом `expired`. Это делает ежедневный cron (FU-01).

### Что после ответа

Функция `decide({ plan, slot, vetVisited, state, originUrgency })` в `packages/shared/src/followup/rules.ts` возвращает решение и следующий слот.

| План / слот | Были у врача | Ответ | Решение (`decision`) | Дальше |
|---|---|---|---|---|
| watch / mid | — | Лучше | `close_improved` | Случай закрыт, предлагаем «Перенесённые случаи» |
| watch / mid | — | Так же | `keep_watching` | Следующий слот `final` по плану |
| watch / mid | — | Хуже | `see_vet_today` | Слот `vet` через 24 ч от ответа |
| watch / final | — | Лучше | `close_improved` | Закрыт |
| watch / final | — | Так же | `see_vet` («не прошло — к врачу») | Слот `vet` через 24 ч |
| watch / final | — | Хуже | `see_vet_today` | Слот `vet` через 24 ч |
| vet | Да | любой | `vet_seen` | Закрыт; предлагаем записать визит (связанный с проверкой) |
| vet | Нет | Лучше | `close_improved` | Закрыт, текст «если вернётся — к врачу» |
| vet | Нет | Так же / Хуже | `see_vet_today`; при исходной `emergency` — `clinic_now` | Ещё один слот `vet` через 24 ч; после второго «Нет» — закрыт с `unresolved` |
| досрочная отметка (`extra`) | — | Лучше | `close_improved` | Закрыт |
| досрочная отметка | — | Так же | `keep_watching` | Расписание не меняется |
| досрочная отметка | — | Хуже | `see_vet_today` | Слот `vet` через 24 ч |

- Отметка отвечает на слот, чьё время уже наступило. Если ни один не наступил, это `extra`: «Так же» не может досрочно вызвать «не прошло — к врачу».
- «Найти клинику рядом» — существующая ссылка поиска Google Maps (`clinicSearchUrl` в `apps/mobile/src/features/checks/check-answers.ts` и `CheckResultContent.tsx`). Её показывают решения `see_vet`, `see_vet_today` и `clinic_now`.
- Повторная проверка внутри случая (FU-03) задаёт новую срочность: план случая перезапускается от времени повторной проверки. `healthy` закрывает случай с исходом `improved`.
- Исходы закрытия (`outcome`): `improved`, `vet_seen`, `unresolved`, `dismissed` (владелец выключил), `expired` (без ответа), `superseded` (новый случай по питомцу), `pet_deleted`.

## Модель данных

Одна миграция `supabase/migrations/<метка>_followup_cases.sql` в FU-01, вторая — в FU-08 для фото. `<метка>` — следующая свободная метка времени.

```sql
create table public.followup_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  origin_check_id uuid not null unique references public.symptom_checks(id) on delete cascade,
  origin_urgency text not null check (origin_urgency in ('emergency','urgent','monitor','home_care')),
  current_urgency text not null check (current_urgency in ('emergency','urgent','monitor','home_care')),
  plan text not null check (plan in ('watch','vet')),
  status text not null default 'off' check (status in ('off','active','closed')),
  next_slot text check (next_slot in ('mid','final','vet')),
  next_due_at timestamptz,
  vet_asks smallint not null default 0,      -- сколько раз спросили «были у врача?»
  escalation text not null default 'none'
    check (escalation in ('none','see_vet','see_vet_today','clinic_now')),
  outcome text check (outcome in ('improved','vet_seen','unresolved','dismissed','expired','superseded','pet_deleted')),
  offered_via text not null check (offered_via in ('mobile','web')),
  enabled_at timestamptz,                    -- первое включение: для доли согласившихся
  hidden_until timestamptz,                  -- «Скрыть до завтра», общее для сайта и телефона
  saved_to_record_at timestamptz,            -- запись в «Перенесённые случаи» (FU-07)
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'closed') = (outcome is not null)),
  check (status <> 'active' or (next_slot is not null and next_due_at is not null))
);
-- Один открытый случай на питомца.
create unique index followup_cases_one_active_per_pet on public.followup_cases (pet_id) where status = 'active';
create index followup_cases_user_due on public.followup_cases (user_id, next_due_at) where status = 'active';

-- Проверки случая: исходная и повторные. Отдельная таблица, а не колонка в symptom_checks:
-- ON DELETE SET NULL на symptom_checks сработал бы как UPDATE и упёрся в refuse_late_writes
-- при удалении аккаунта.
create table public.followup_case_checks (
  case_id uuid not null references public.followup_cases(id) on delete cascade,
  check_id uuid not null unique references public.symptom_checks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('origin','recheck')),
  created_at timestamptz not null default now(),
  primary key (case_id, check_id)
);

create table public.followup_checkins (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.followup_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null check (slot in ('mid','final','vet','extra')),
  vet_visited boolean,                       -- только для слота vet
  state text not null check (state in ('better','same','worse')),
  note text check (char_length(note) <= 500),
  decision text not null check (decision in ('close_improved','keep_watching','see_vet','see_vet_today','clinic_now','vet_seen')),
  urgency_at_answer text not null,           -- current_urgency в момент ответа: для статистики
  hours_since_check numeric(6,1) not null,   -- от исходной проверки
  source text not null check (source in ('notification','pets_list','pet_card','web_banner','timeline','result')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (case_id, idempotency_key)
);
create index followup_checkins_case on public.followup_checkins (case_id, created_at);
```

- **RLS.** Все три таблицы только для сервера, как `check_jobs`: RLS включена, политик нет, `revoke all from anon, authenticated`. Добавить их в `SERVICE_ONLY_TABLES` и `REQUIRED_TABLES` в `apps/web/tests/integration/schema.test.ts`.
- **Поздние записи.** Триггер `refuse_late_writes` на каждую таблицу (`public.refuse_write_for_inactive_account()`), как в `20261020140000_medication_reminders.sql`.
- **Удаление аккаунта.** Все внешние ключи — `on delete cascade`, ни одного `set null`. `delete_account_data` удаляет `symptom_checks` раньше питомцев, так что случаи уходят каскадом. Отдельный шаг в функции не нужен. Обновить `docs/architecture/deletion-data-map.md` §1 и §2 и проверки количества в `tests/integration/deletion-worker-sql.test.ts`. При необходимости дописать таблицы в `TRUNCATED_TABLES` у `db-guard.ts`.
- **Мягкое удаление.** Питомец (`pets.deleted_at`): триггер, как `pets_drop_doses`, закрывает его открытый случай с исходом `pet_deleted`, и тот пропадает из списков. Проверка с `deleted_at`: случай по ней не показывается.
- **Состояние `off`.** Строка создаётся при первом показе предложения, даже если владелец не включил напоминание. Так статистика видит долю согласившихся. Случаи `off` нигде не показываются.
- **Атомарность.** Отметка, пересчёт случая и закрытие прежнего случая питомца выполняются в одной SQL-функции (`record_followup_checkin`, `set_followup_enabled`) с `security definer`, `set search_path = public`, `revoke ... from public, anon, authenticated`. Функции добавить в `REQUIRED_FUNCTIONS`. Правило `decide()` при этом живёт в `packages/shared`: сервер вычисляет решение в TypeScript и передаёт в функцию готовые поля. SQL проверяет только инварианты.

## API

Все маршруты — `/api/v1`, с текущей авторизацией (`withApiAuth`), согласием и проверкой владельца. Чужой случай отвечает `404`. Схемы — новый модуль `packages/contracts/src/followup.ts`, регистрация в `openapi.ts`, снапшот `docs/api/openapi.yaml`, список путей в `tests/unit/contracts/openapi.test.ts`.

| Метод и путь | Тело / ответ | Этап |
|---|---|---|
| `GET /checks/{id}/followup` | `{ offer: FollowupOffer \| null, case: FollowupCase \| null }`. `offer` — можно ли предложить, значение по умолчанию и моменты слотов. | 01 |
| `PUT /checks/{id}/followup` | `{ enabled: boolean, via: 'mobile' \| 'web' }` → `FollowupCase`. Идемпотентно: создаёт или переключает. `409 followup_not_available` для `healthy`, без питомца, старше 12 ч или удалённой проверки. | 01 |
| `GET /followups?status=active` | `{ items: FollowupCaseSummary[] }`: питомец (имя, вид), исходная дата и срочность, `next_slot`, `next_due_at`, `escalation`, `hidden_until`. Источник для уведомлений, карточек и баннера. | 01 |
| `GET /followups/{caseId}` | `FollowupCase` с хронологией: проверки случая, отметки, связанные визиты (`pet_health_events.check_id` среди проверок случая). | 01 |
| `POST /followups/{caseId}/checkins` | Заголовок `Idempotency-Key`, тело `{ vet_visited?, state, note?, source }` → `{ checkin, decision, case }`. Повтор с тем же ключом возвращает тот же ответ. Закрытый случай → `409 followup_closed`. | 01 |
| `POST /followups/{caseId}/dismiss` | Закрыть без исхода (`dismissed`). | 01 |
| `POST /followups/{caseId}/snooze` | `?today=` → `hidden_until` = завтра 09:00 по дате клиента. | 01 |
| `PUT` / `DELETE /followups/{caseId}/record` | Записать в «Перенесённые случаи» или убрать оттуда. Только закрытые случаи. | 07 |
| `GET /pets/{id}/health/episodes` | Список «Перенесённых случаев» питомца. | 07 |

Изменения существующих маршрутов:

- **`POST /checks` и `POST /api/symptom-check`.** В `CheckCreateInputSchema` — необязательное `followup_case_id` (FU-03). Схема входа строгая, но новые поля в ней не мешают старым сборкам: они их просто не шлют.
- **`GET /checks` и `GET /checks/{id}`.** С признаком `followup` к записи добавляется `followup: { case_id, kind, status, outcome } | null`, без признака ответ прежний. Константы `FOLLOWUP_FEATURE = 'followup'` — рядом с `PET_DATES_FEATURE` в `packages/contracts/src/pet.ts` или в новом модуле с реэкспортом. Чтение — через `reads(request, FOLLOWUP_FEATURE)` из `apps/web/src/server/pets/pet-contract.ts`. В OpenAPI поле не входит в `required`, как поля питомца.
- **Сводка для врача (`/pets/{id}/health/summary`).** Раздел перенесённых случаев отдаётся только с признаком `followup` (FU-07).
- **Клиент.** `packages/shared/src/api-client.ts:219` дописывает `followup` в заголовок. Веб использует тот же клиент или серверные загрузчики, как `ResultFeedback`.

Серверный модуль: `apps/web/src/server/followup/` (`followup-service.ts`, `followup-contract.ts`). Импорты `next/*` — только в адаптерах маршрутов (`tests/server/architecture/service-boundaries.test.ts`). Ограничение частоты для отметок — существующий `consumeRateLimit`, новый ключ `followup_write`, 30 в час.

## Мобильная часть

### Уведомления

- **Общий планировщик.** Случаи встраиваются в `apps/mobile/src/features/medical-record/reminders/`, а не в отдельный модуль: `sync.ts` при каждом запуске снимает все уведомления (`cancelAll`), отдельный планировщик стёр бы свои. `ReminderAccount.load()` дополнительно читает `api.listFollowups()`. Новый чистый `followups.ts` превращает случаи в `PlannedReminder`.
- **Идентификатор и данные.** Идентификатор `lapka-followup-${caseId}-${slot}`, данные `{ kind: 'followup', petId, caseId, userId }`. Планируется только ближайший слот каждого открытого случая. `hidden_until` в будущем откладывает уведомление до этого момента.
- **Лимит iOS 64.** Сначала случаи (их не больше одного на питомца), затем приёмы лекарств, затем сроки медкарты. Правило `REMINDER_LIMIT` в `sync.ts` расширить и покрыть тестом.
- **Время.** `fireMoment` с тихими часами 09–21. Триггеры как сейчас: `CALENDAR` на iOS, `DATE` с каналом `reminders` на Android.
- **Когда пересчитывается.** При входе и запуске, при возврате в приложение (не чаще раза в 10 минут), после `PUT /checks/{id}/followup`, после отметки, «Скрыть» и «Не напоминать». При выходе из аккаунта всё снимается: `sync.clear()` уже это делает.
- **Переустановка и другое устройство.** Расписание строится из серверного списка при первом запуске после входа. Случай, включённый на сайте, попадёт на телефон при следующем открытии приложения. Если приложение не открывали, сработает только баннер на сайте и карточка в приложении. Это ограничение локальных уведомлений, оно описано в отчёте FU-05.
- **Два телефона.** Уведомление придёт на оба. После ответа на одном второй снимет его при следующем открытии, а экран отметки покажет «уже отмечено» и следующий шаг.
- **Общий выключатель.** Настройка «Напоминания» в профиле выключает и уведомления случаев: телефон не должен звонить, если человек выключил напоминания. Карточки и баннер остаются. Текст настройки в профиле дополнить: «О сроках, лекарствах и самочувствии после проверки».
- **Разрешение.** Блок «Напомнить» (М-1) не вызывает системный диалог сам. Кнопка «Разрешить» открывает существующую шторку из `ReminderProvider` с текстом М-2. Явное нажатие игнорирует отсрочку «Не сейчас». Если в ОС запрещено — `Linking.openSettings()`.

### Переходы

- **Тап по уведомлению.** Обработка в `ReminderProvider.tsx` (`useLastNotificationResponse`, ожидание авторизации и согласия, дедупликация). `openTarget` получает ветку `kind === 'followup'`: проверка UUID, совпадение `userId`, питомец существует. Тогда открывается `/pets/{petId}/followup/{caseId}/checkin`, иначе `/pets`. Через `guardTabSwitch`, как сейчас.
- **Новые маршруты** во вкладке «Питомцы»:
  - `app/(tabs)/pets/[id]/followup/[caseId]/index.tsx` — хронология (FU-07; до него — заглушки нет, ссылка ведёт на исходный результат);
  - `.../checkin.tsx` — отметка (FU-06).
- **Код фичи** — в `apps/mobile/src/features/followup/`.

### Экраны

| Макет | Где | Этап |
|---|---|---|
| М-1 «Напомнить» | `src/features/checks/CheckResult.tsx`. Для monitor и home_care — после срочности и клиники, для urgent и emergency — после «Записать визит». | 05 |
| М-2 Разрешение | Шторка `ReminderProvider` | 05 |
| М-3 Уведомление | Тексты в `i18n` | 05 |
| М-6 Карточки | `app/(tabs)/pets/index.tsx` (над списком), `pets/[id]/index.tsx` (блок над «Сегодня») | 05 |
| М-4 Отметка, М-5 Итог | `pets/[id]/followup/[caseId]/checkin.tsx` | 06 |
| М-8 Повторная проверка | `app/(tabs)/check/index.tsx` с параметром `caseId` | 06 (после 03) |
| М-7 История и хронология | `src/features/checks/CheckHistory.tsx`, новый экран хронологии | 07 |
| М-9 «Перенесённые случаи» | Карточка питомца, сводка для врача | 07 |

### Выпуск: EAS Update или сборка

Нужное уже в сборке: `expo-notifications` (FB-5), `expo-image-picker` (камера и галерея в форме проверки, FB-4), `expo-updates` с `runtimeVersion: { policy: "fingerprint" }`. FU-05…FU-07 не добавляют нативных модулей, плагинов и разрешений. Поэтому они уходят через EAS Update на сборки с текущим fingerprint, то есть собранные после PR #82 (1.1.0). Пользователи более старых сборок получат фичу только с обновлением из стора.

Fingerprint ломают и требуют сборки: добавление `expo-notifications` в `plugins` (иконка или цвет уведомления), изменение текстов разрешений, новые пакеты. FU-08 проверяет, подходят ли текущие тексты доступа к камере и фото для хранения фото отметок. После FB-4/04 они не обещают удаление. Если тексты нужно менять — это сборка.

## Веб

- **В-1 «Напомнить»** на `/check/[id]` (`CheckResultContent.tsx`): после `result-hero` или в правой колонке над `ResultFeedback`. Текст объясняет, что напоминание придёт на главную кабинета и в приложение, если оно установлено. Браузерных уведомлений нет.
- **В-2 Баннер** на `/dashboard` (`DashboardContent.tsx`): после `PetSavedBanner`, перед `welcome-panel`. Данные — из `server/dashboard/load-dashboard.ts`, чтение открытых случаев с `next_due_at <= now()` и `hidden_until` в прошлом. Баннеров не больше двух, дальше «Ещё N».
- **В-3 Отметка и итог** — страница `/checks/case/[caseId]` (или модальное окно — по решению дизайнера). Формы — клиентские компоненты по образцу `ResultFeedback.tsx`. Повторное нажатие и обрыв сети не создают второй отметки: ключ идемпотентности генерируется при открытии формы.
- **В-4 История** `/checks` группирует проверки случая, **В-5** — блок в медкарте (FU-07).
- Ширины проверки: 1440, 1024, 768, 390, 320.

## Аналитика (FU-04)

Внешней аналитики нет и не добавляем. Всё считается из таблиц случаев.

`apps/web/src/server/admin/statistics.ts` сейчас выбирает таблицы целиком и агрегирует в JS. При `max_rows = 1000` счёт упирается в 1000 строк. Для случаев так не делать: новая SQL-функция `admin_followup_statistics(p_from timestamptz, p_to timestamptz)` (только `service_role`) возвращает готовые агрегаты. `getAdminStatistics` вызывает её через сервисный клиент, тип — в `apps/web/src/shared/types/admin.ts`. Период тот же, 7/30/90 дней, по дате исходной проверки.

| Метрика | Как считается | Зачем |
|---|---|---|
| Предложено и включено по уровням | `count(*)` и `count(enabled_at)` по `origin_urgency` | Доля согласившихся, отдельно для значения по умолчанию и для «предлагаем» |
| Ответили хотя бы раз | Случаи с отметкой / включённые случаи, по уровням | Работает ли возврат |
| Источник первой отметки | `source` первой отметки | Уведомление, карточка или баннер |
| Первый ответ по уровням | Матрица уровень × лучше / так же / хуже, с n | Главный вопрос: например, как часто «хуже» после `home_care` |
| Исходы закрытых случаев | Уровень × `outcome` | Сколько прошло само, сколько дошло до врача, сколько без ответа |
| Эскалации | Доля случаев с `escalation <> 'none'` по уровням | Как часто правило отправляет к врачу |
| Были у врача (urgent/emergency) | Доля `vet_visited = true` в первой отметке слота `vet` | Следуют ли совету |
| Повторные проверки | Случаи с `recheck` / случаи с ответом «Хуже»; доля повторных с более высокой срочностью | Калибровка первой оценки модели и спрос на платную проверку |
| Время до «Лучше» | Медиана `hours_since_check` для `close_improved` по уровням | Реальная длительность эпизодов |
| Записано в медкарту | Доля `saved_to_record_at` среди `improved` | Нужен ли блок «Перенесённые случаи» |

Проценты при n < 10 не выводятся, только число. На странице `/admin/statistics` (`AdminStatisticsClient.tsx`) — новый раздел «Наблюдение после проверки»: карточки по существующему образцу и таблица матрицы. Дизайн не нужен.

## Тексты

Ключи мобильного словаря — `followup.*` в `apps/mobile/src/i18n/ru.ts` и `en.ts`, веб — в словаре сайта. Тексты уровней (`urgency.*`) не меняются.

| Ключ | ru | en |
|---|---|---|
| `offer.title` | Напомнить, как {name}? | Check in on {name} later? |
| `offer.watch12` | Спросим через 12 часов и через 2 дня. Если лучше не станет — подскажем, что делать | We'll ask in 12 hours and in 2 days. If it doesn't improve, we'll tell you what to do |
| `offer.watch24` | Спросим завтра и через 3 дня | We'll ask tomorrow and in 3 days |
| `offer.vet` | Завтра спросим, были ли у врача и что он сказал | Tomorrow we'll ask whether you saw a vet and what they said |
| `offer.web` | Напомним на главной кабинета и в приложении «Лапка», если оно установлено | We'll remind you on your dashboard and in the Lapka app, if you have it |
| `offer.next` | Первое — {when} | First one {when} |
| `offer.allow` | Разрешите уведомления, иначе напомним только в приложении | Allow notifications, or we'll only remind you inside the app |
| `offer.partOf` | Часть случая от {date} · {count} | Part of the case from {date} · {count} |
| `offer.replaces` | Уже идёт наблюдение: {name}, проверка {date}. Включите — и будем спрашивать про новую | We're already checking in on {name} after {date}. Turn this on to follow the new check instead |
| `notify.watch` | Как {name}? Отметьте, стало ли лучше | How is {name}? Let us know if it's better |
| `notify.vet` | Как {name}? Расскажите, были ли у врача | How is {name}? Tell us if you've seen a vet |
| `checkin.question` | Как {name} сейчас? | How is {name} now? |
| `checkin.better` | Лучше — Симптомы ушли или заметно слабее | Better — Symptoms are gone or much milder |
| `checkin.same` | Так же — Без заметных изменений | The same — No noticeable change |
| `checkin.worse` | Хуже — Симптомы сильнее или появились новые | Worse — Symptoms are stronger or new ones appeared |
| `checkin.vetQuestion` | Были у врача? | Have you seen a vet? |
| `checkin.vetYes` / `vetNo` | Да, были / Ещё нет | Yes / Not yet |
| `checkin.note` | Что изменилось? Необязательно | What has changed? Optional |
| `checkin.submit` | Отметить | Save |
| `checkin.closed` | Этот случай уже закрыт | This case is already closed |
| `decision.improved` | Хорошо, что стало лучше. Случай закрыт. Если симптомы вернутся — проверьте снова | Glad {name} is better. The case is closed. If symptoms come back, check again |
| `decision.keepWatching` | Наблюдаем дальше. Спросим ещё раз {when} | Let's keep watching. We'll ask again {when} |
| `decision.seeVet` | Стоит показаться врачу. Прошло {period}, а лучше не стало — в таких случаях нужен осмотр ветеринара | Time to see a vet. It's been {period} without improvement — that's a reason to see a vet |
| `decision.seeVetToday` | Покажитесь врачу сегодня. Если стало хуже, лучше не ждать. При затруднённом дыхании, судорогах или если питомец не встаёт — сразу в клинику | See a vet today. If it's getting worse, don't wait. If breathing is laboured, there are seizures or your pet can't stand — go to a clinic now |
| `decision.clinicNow` | Нужна клиника сейчас | Go to a clinic now |
| `decision.vetSeen` | Запишите, что сказал врач | Write down what the vet said |
| `decision.recheck` | Проверить снова с учётом прошлой · Спишется 1 проверка, у вас {n} | Check again with the previous one in mind · Uses 1 check, you have {n} |
| `decision.noCredits` | Проверки закончились · Запросить ещё | You're out of checks · Request more |
| `record.save` | Записать в медкарту | Add to health record |
| `record.saved` | Записано в медкарту | Added to health record |
| `episodes.title` | Перенесённые случаи | Past episodes |
| `banner.title` | Как {name} после проверки {date}? | How is {name} after the check on {date}? |
| `banner.hide` | Скрыть до завтра | Hide until tomorrow |
| `dismiss` | Не напоминать больше | Stop reminding me |

Имя питомца не склоняем: в текстах оно стоит только в именительном падеже («Как Мурка?»), остальные формулировки обходятся без имени («Покажитесь врачу сегодня»). Медицинские формулировки решений (`decision.*`) перед выпуском просматривает ветеринар (открытый вопрос 1).

## FU-01. Случай, правила и API

**Цель:** сервер хранит случаи, считает расписание и решения и отдаёт API. Интерфейса нет.

**Файлы:** миграция `<метка>_followup_cases.sql`; `packages/contracts/src/followup.ts`, `index.ts`, `openapi.ts`; `packages/shared/src/followup/plan.ts`, `rules.ts`, `index.ts`; `packages/shared/src/api-client.ts` (методы и признак `followup`); `apps/web/src/server/followup/`; маршруты `apps/web/src/app/(backend)/api/v1/checks/[id]/followup/`, `.../v1/followups/**`; cron `apps/web/src/app/(backend)/api/cron/followup-expiry/route.ts` и запись в `vercel.json`; `docs/architecture/deletion-data-map.md`; `docs/api/openapi.yaml`.

- [ ] Зафиксировать базовые проверки (`typecheck`, `test` всех пакетов) до изменений.
- [ ] Тесты `plan` и `rules` по таблицам выше, включая тихие часы, полночь и переход на летнее время (`fireMoment`), досрочную отметку и второе «Ещё нет».
- [ ] Миграция, RLS, триггеры, SQL-функции, тест схемы.
- [ ] Сервис и маршруты, признак `followup` в `GET /checks` и `GET /checks/{id}`.
- [ ] Cron закрытия без ответа, авторизация `CRON_SECRET`, как у `cron/photo-uploads`.
- [ ] Интеграционные тесты на локальной базе, отчёт.

**Нумерованные критерии приёмки:**

- [ ] **FU-01.1** `planFor` и `decide` покрыты тестами на каждую строку обеих таблиц. `fireMoment` переносит 23:30 → 09:00, 03:00 → 09:00 того же дня, не сдвигает дневной момент. Перевод часов не даёт сдвига дня.
- [ ] **FU-01.2** `PUT /checks/{id}/followup` создаёт один случай при повторе и параллельных запросах. Отвечает `409` для `healthy`, проверки без питомца, старше 12 ч и удалённой. Включение по новой проверке закрывает прежний открытый случай питомца как `superseded`.
- [ ] **FU-01.3** `POST .../checkins` с тем же `Idempotency-Key` возвращает тот же результат и одну строку. Закрытый случай — `409`. Решение и следующий слот совпадают с `decide()`.
- [ ] **FU-01.4** Второй пользователь получает `404` на каждый маршрут чужого случая. Таблицы недоступны `anon` и `authenticated` напрямую (тест с двумя пользователями на реальной базе).
- [ ] **FU-01.5** Удаление аккаунта с открытым случаем, отметками и повторной проверкой проходит. Строк не остаётся (`deletion-worker-sql.test.ts`). Мягкое удаление питомца закрывает его случай как `pet_deleted`.
- [ ] **FU-01.6** Без `followup` в `X-Lapka-Features` ответы `GET /checks` и `GET /checks/{id}` побайтно совпадают с прежними. С признаком — содержат `followup`. Старый строгий клиент (`SymptomCheckRecordSchema` до изменения) читает ответ без признака.
- [ ] **FU-01.7** Cron закрывает активный случай через 7 дней после последнего слота как `expired`. Запрос без секрета — `401`.
- [ ] **FU-01.8** OpenAPI, снапшот и тест путей обновлены. `deletion-data-map.md` перечисляет новые таблицы.

**Отчёт:** `docs/verification/followup-01.md`. **Оценка:** 3–4 дня.

## FU-02. Веб: предложение, баннер, отметка

**Ждёт дизайна:** В-1, В-2, В-3 из `docs/design/followup-loop-v1/`.

**Цель:** на сайте можно включить наблюдение, увидеть баннер в нужное время, отметиться и получить итог.

**Файлы:** `apps/web/src/features/symptom-check/CheckResultContent.tsx`, новые `apps/web/src/features/followup/`, `features/dashboard/DashboardContent.tsx`, `server/dashboard/load-dashboard.ts`, страница `app/(frontend)/checks/case/[caseId]/`, словари сайта.

- [ ] Сверить макеты и решить «страница или модальное окно» по README дизайна.
- [ ] Блок «Напомнить» со всеми состояниями М-1/В-1, кроме «часть случая» (до FU-03 он не возникает).
- [ ] Баннер, «Скрыть до завтра», эскалация с кнопкой клиник.
- [ ] Отметка и итог, кроме «Проверить снова» (FU-03) и «Записать в медкарту» (FU-07). Решение `vet_seen` ведёт в существующую форму визита со связью с проверкой (`medicalRecordHref.newRecord(pet.id, 'visit')&check=`).
- [ ] Тесты компонентов и загрузчика, ручная проверка на ширинах, отчёт.

**Нумерованные критерии приёмки:**

- [ ] **FU-02.1** У проверки `monitor` младше 12 ч блок включён по умолчанию, у `urgent` — выключен, у `healthy` и старой проверки блока нет. Переключение переживает обновление страницы.
- [ ] **FU-02.2** Баннер появляется не раньше `next_due_at`, исчезает после отметки и после «Скрыть до завтра» и возвращается на следующий день. Больше двух баннеров не бывает.
- [ ] **FU-02.3** Каждая строка таблицы решений показывает свой итог и действия. Клиника открывается в новой вкладке. «Были у врача — да» открывает форму визита, связанную с исходной проверкой.
- [ ] **FU-02.4** Двойное нажатие и обрыв сети не создают второй отметки и не показывают ложный успех. Введённая заметка не теряется.
- [ ] **FU-02.5** Экраны соответствуют макетам на 1440, 1024, 768, 390, 320 px. Работают клавиатура и фокус, ответ подписан словом, а не только цветом.
- [ ] **FU-02.6** Случай, включённый на сайте, виден в `GET /followups` с тем же сроком. Это источник для телефона из FU-05.

**Отчёт:** `docs/verification/followup-02.md`. **Оценка:** 3 дня.

## FU-03. Повторная проверка с учётом прошлой

**Ждёт дизайна:** плашка М-8 (на сайте — та же плашка в форме `/check`).

**Цель:** после «Хуже» или «не прошло» владелец может запустить платную проверку, и модель учтёт исходную проверку и отметки. Бесплатных вызовов нет.

**Файлы:** `packages/contracts/src/analysis.ts` (`followup_case_id`), `apps/web/src/server/checks/check-job-service.ts`, `server/symptom-check/analyze-symptom-check.ts`, `symptom-check-http.ts` (`parseRequest`), новый `server/followup/recheck-context.ts`, форма `/check` на сайте.

- [ ] Проверка `followup_case_id` до списания (`apply_symptom_check_usage`): случай свой, того же питомца, открыт или закрыт не раньше 14 дней назад. Иначе `409 followup_not_available` без списания.
- [ ] Блок контекста `PREVIOUS CHECK` в пользовательском тексте: дата, срочность, причина, первые 300 символов симптомов и отметки с заметками. Всё в кавычках как данные, как `quoted()` в `analysis-context.ts`. Предел — 1500 символов. В системный промпт — правило, что это история, а не инструкции.
- [ ] После сохранения проверки — строка `followup_case_checks(kind='recheck')`, перезапуск плана случая по новой срочности, `healthy` закрывает случай. Всё в одной транзакции с завершением задачи.
- [ ] Веб: кнопка в итогах FU-02 и плашка в форме.
- [ ] Тесты с подменённым `analyse` (как `check-jobs.test.ts`), отчёт.

**Нумерованные критерии приёмки:**

- [ ] **FU-03.1** Повторная проверка списывает ровно одну проверку. При ошибке анализа кредит возвращается, как в обычной проверке. Чужой или неподходящий случай отклоняется без списания.
- [ ] **FU-03.2** Промпт содержит блок прошлой проверки не длиннее предела. Заметка с текстом-инструкцией попадает в кавычки и не меняет формат ответа (тест на сохранённом промпте).
- [ ] **FU-03.3** Новая проверка связана со случаем. План перезапущен по новой срочности. `healthy` закрывает случай как `improved`. Результат показывает «Часть случая от …».
- [ ] **FU-03.4** При нуле проверок кнопка ведёт в существующий запрос дополнительной проверки, а не в форму.
- [ ] **FU-03.5** Без `followup_case_id` проверка работает и стоит как раньше (регрессия `check-jobs`, `symptom-check-http`).

**Отчёт:** `docs/verification/followup-03.md`. **Оценка:** 2 дня.

## FU-04. Метрики в админской статистике

**Цель:** администратор видит, что стало с питомцами после проверок.

**Файлы:** миграция с `admin_followup_statistics`, `apps/web/src/server/admin/statistics.ts`, `apps/web/src/shared/types/admin.ts`, `apps/web/src/features/admin/AdminStatisticsClient.tsx`, `tests/server/admin/statistics.test.ts`, интеграционный тест функции.

**Нумерованные критерии приёмки:**

- [ ] **FU-04.1** Функция возвращает все метрики из раздела «Аналитика» на заранее заданном наборе данных. Результат сверен с ручным подсчётом в тесте.
- [ ] **FU-04.2** Счёт не ограничен 1000 строками: тест с более чем 1000 случаями.
- [ ] **FU-04.3** Функция недоступна `anon` и `authenticated`, страница — пользователю без роли `admin`.
- [ ] **FU-04.4** При n < 10 вместо процента выводится число. Период 7/30/90 дней меняет данные раздела.

**Отчёт:** `docs/verification/followup-04.md`. **Оценка:** 1–1,5 дня.

## FU-05. Мобильный: предложение и уведомления

**Ждёт дизайна:** М-1, М-2, М-3, М-6.

**Цель:** на телефоне можно включить наблюдение. Уведомление приходит в нужное время и открывает отметку. Карточки «Как Мурка?» видны без уведомлений.

**Файлы:** `apps/mobile/src/features/checks/CheckResult.tsx`, новые `apps/mobile/src/features/followup/`, `features/medical-record/reminders/{followups.ts (новый), sync.ts, ReminderProvider.tsx, notifications.ts}`, `app/(tabs)/pets/index.tsx`, `pets/[id]/index.tsx`, `app/(tabs)/profile/reminders.tsx` (текст), `i18n/ru.ts`, `en.ts`.

- [ ] Планировщик `followups.ts` и расширение `sync.ts` с тестами лимита и приоритета.
- [ ] Блок «Напомнить» со всеми состояниями. Пересчёт уведомлений после переключения.
- [ ] Ветка `followup` в `openTarget`. Экран отметки появляется в FU-06; до него тап ведёт на исходный результат проверки. FU-05 и FU-06 выходят к пользователям одной мобильной пачкой.
- [ ] Карточки в списке питомцев и в карточке питомца.
- [ ] Проверка на физических iPhone и Android, отчёт.

**Нумерованные критерии приёмки:**

- [ ] **FU-05.1** `monitor`: уведомления запланированы на +12 ч и +48 ч с переносом тихих часов. После ответа на первый слот остаётся только следующий.
- [ ] **FU-05.2** Случай, включённый на сайте, после открытия приложения даёт уведомление. После переустановки и входа уведомления восстановлены. После выхода и входа в другой аккаунт чужих нет.
- [ ] **FU-05.3** При 70 будущих напоминаниях случаи и лекарства остаются в пределах 64, сроки медкарты сокращаются первыми.
- [ ] **FU-05.4** Тап с холодного старта после входа открывает отметку нужного случая. Удалённый питомец, чужой `userId`, закрытый случай ведут безопасно (`/pets` или «уже закрыт»).
- [ ] **FU-05.5** Разрешение не запрашивается без нажатия. Отказ в ОС ведёт в настройки. Общий выключатель «Напоминания» снимает и уведомления случаев, карточки остаются.
- [ ] **FU-05.6** Карточки: появляются в момент слота, исчезают после отметки и «Скрыть до завтра», эскалация показана текстом.
- [ ] **FU-05.7** Ни одного нового нативного модуля, плагина или разрешения: fingerprint проекта (`@expo/fingerprint`) совпадает с текущей сборкой 1.1.0. Значит, выпуск возможен через EAS Update.

**Отчёт:** `docs/verification/followup-05.md`. **Оценка:** 3 дня.

## FU-06. Мобильный: отметка и «что дальше»

**Ждёт дизайна:** М-4, М-5, М-8.

**Цель:** владелец отвечает «Лучше / Так же / Хуже» и сразу получает итог по правилу.

**Файлы:** `app/(tabs)/pets/[id]/followup/[caseId]/checkin.tsx`, `features/followup/`, `app/(tabs)/check/index.tsx` (параметр `caseId`, после FU-03), форма визита (`pets/[id]/visit-form.tsx`, уже принимает `checkId`).

**Нумерованные критерии приёмки:**

- [ ] **FU-06.1** Каждая строка таблицы решений даёт свой итог на русском и английском. Варианты для `vet` начинаются с «Были у врача?».
- [ ] **FU-06.2** Повторное нажатие, обрыв сети и перезапуск во время отправки не дают двух отметок. Заметка сохраняется до успеха.
- [ ] **FU-06.3** «Найти клинику» открывает поиск карт. «Записать визит» открывает форму визита, связанную с последней проверкой случая. После сохранения визит виден в хронологии (FU-07) и в медкарте.
- [ ] **FU-06.4** «Проверить снова» открывает форму с плашкой М-8 и списывает одну проверку. При нуле — запрос дополнительной проверки (`extra-check`).
- [ ] **FU-06.5** Малые экраны (320 pt) и крупный системный шрифт: три ответа и действия доступны, не перекрыты нижней панелью и клавиатурой. VoiceOver и TalkBack читают ответ словом.

**Отчёт:** `docs/verification/followup-06.md`. **Оценка:** 3 дня.

## FU-07. Хронология и «Перенесённые случаи»

**Ждёт дизайна:** М-7, М-9, В-4, В-5.

**Цель:** проверки и отметки видны одной хронологией. Закрытый «лучше» случай можно записать в медкарту, и он попадает в сводку для врача.

**Файлы:** `apps/mobile/src/features/checks/CheckHistory.tsx`, `pets/[id]/followup/[caseId]/index.tsx`, карточка питомца и сводка для врача (`features/medical-record/`), веб `/checks`, страница случая, `MedicalRecordView.tsx`, сервер `health/episodes`, `health/summary`, `PUT/DELETE /followups/{id}/record`.

**Нумерованные критерии приёмки:**

- [ ] **FU-07.1** История на обоих клиентах показывает случай одной строкой с исходом. Проверка без случая — как раньше. Пагинация по курсору не теряет и не дублирует строки на границе страниц.
- [ ] **FU-07.2** Хронология показывает исходную и повторные проверки, отметки и связанные визиты по времени, в часовом поясе устройства.
- [ ] **FU-07.3** «Записать в медкарту» идемпотентно, его можно отменить. Запись видна в «Перенесённых случаях» на сайте и в приложении.
- [ ] **FU-07.4** Сводка для врача включает перенесённые случаи за 6 месяцев только для клиента с признаком `followup`. PDF не обрезает длинный список. Памятка для передержки случаев не содержит (FB-3/02).
- [ ] **FU-07.5** «Не напоминать больше» закрывает случай с подтверждением и снимает уведомления.

**Отчёт:** `docs/verification/followup-07.md`. **Оценка:** 3–4 дня.

## FU-08. Фото в отметках

**Ждёт дизайна:** фото-варианты М-4 и М-7.

**Цель:** к отметке можно приложить до 3 фото и сравнить их по дням.

**Решение владельца:** приватный бакет Supabase `followup-photos` по образцу `pet-avatars` (FB-4). Это первое постоянное хранение фото симптомов: решение 1.6 в `docs/verification/OPEN_QUESTIONS.md` («фото не хранятся») касается фото проверок и остаётся в силе. До слияния владелец согласует правку политики конфиденциальности и, если нужно, текста согласия.

**Файлы:** миграция (бакет, `followup_photos(id, checkin_id → cascade, user_id → cascade, object_path)`), `apps/web/src/server/uploads/photo-storage.ts` (`removeUserPhotos` чистит и `followup-photos/<user>/`), загрузка по подписанной ссылке как у `POST /uploads`, клиенты.

**Нумерованные критерии приёмки:**

- [ ] **FU-08.1** Свой JPEG/PNG/WebP до 5 МБ принимается. Чужой путь, неверный тип и лишний файл отклоняются. Анонимно объект не читается. Ссылки на чтение подписанные и короткоживущие.
- [ ] **FU-08.2** Удаление случая, питомца и аккаунта удаляет объекты. Очистка `check-photos` их не трогает.
- [ ] **FU-08.3** Сравнение «по дням» показывает фото разных отметок с датами на телефоне и на сайте.
- [ ] **FU-08.4** Тексты разрешений камеры и фото соответствуют хранению. Если их нужно менять — выпуск сборкой, и это записано в отчёте.
- [ ] **FU-08.5** Политика конфиденциальности обновлена до выпуска (ссылка на решение владельца).

**Отчёт:** `docs/verification/followup-08.md`. **Оценка:** 3 дня плюс согласование политики.

## FU-09. Общая приёмка и мобильный выпуск

**Цель:** весь цикл проверен как путь пользователя на сайте и обоих телефонах и готов к решению о выпуске мобильной пачки.

**Нумерованные критерии приёмки:**

- [ ] **FU-09.1** Сквозные пути на staging, на физических iPhone и Android и на сайте: `monitor` → «Так же» → «Так же» → клиника; `home_care` → «Хуже» → повторная проверка; `urgent` → «Были у врача — да» → визит; «Лучше» → медкарта → сводка для врача.
- [ ] **FU-09.2** Старая сборка из стора (до фичи) работает с новым API: история, результат, проверка.
- [ ] **FU-09.3** Fingerprint совпадает со сборкой в сторах. Выпуск через EAS Update возможен, но не выполнен: решение за владельцем.
- [ ] **FU-09.4** Админская статистика показывает данные тестовых случаев.
- [ ] **FU-09.5** Строки FU-01…FU-08 в `docs/verification/README.md` и раздел в `docs/mobile-api-plan.md` обновлены.

**Отчёт:** `docs/verification/followup-09.md`. **Оценка:** 2 дня.

## Команды проверки

Из корня репозитория, после реализации выбранного этапа:

```sh
npm run typecheck --workspace=@lapka/contracts
npm run typecheck --workspace=@lapka/shared
npm run typecheck --workspace=@lapka/web
npm run typecheck --workspace=@lapka/mobile
npm run test --workspace=@lapka/shared -- src/followup
npm run test --workspace=@lapka/web -- tests/server/followup
npm run test --workspace=@lapka/mobile -- src/features/followup src/features/medical-record/reminders
```

Интеграционные тесты (`npm run test:integration --workspace=@lapka/web -- tests/integration/followup-NN.test.ts`) — только после чтения `apps/web/tests/support/db-guard.ts`, на локальной базе. Отсутствие тестов не считать успехом. После `supabase db reset` перезапустить локальный стек (`supabase stop && supabase start`), иначе тесты Storage падают с 42P10.

## Риски

1. **Медицинские тексты без проверки врачом.** Итоги «к врачу сегодня», «нужна клиника сейчас» — фиксированные советы от имени приложения. Их нужно показать ветеринару до выпуска, как справочник вакцин (MR-04).
2. **Локальные уведомления зависят от открытия приложения.** Случай с сайта или после переустановки не прозвенит, пока приложение не открыли. Компенсация — баннер и карточки. Если доля ответов окажется низкой, серверные push можно обсуждать отдельно на данных FU-04.
3. **Мало проверок для повторной.** При 2 стартовых проверках многие придут к «Хуже» с нулём. Повторная проверка тогда ведёт в ручной запрос через Telegram. Это нагрузка на администратора. Метрика FU-04 покажет спрос.
4. **Удаление аккаунта со связанным визитом.** У `pet_health_events.check_id` стоит `on delete set null`. При удалении аккаунта это UPDATE, который может упереться в `refuse_late_writes`. Теста на визит, связанный с проверкой, нет. Цикл наблюдения ведёт людей в такие визиты чаще, поэтому FU-01 добавляет этот сценарий в `deletion-worker-sql.test.ts`. Если он падает — исправить до слияния FU-06 или отдельным PR.
5. **Статистика упирается в 1000 строк.** Существующие счётчики `statistics.ts` при `max_rows = 1000` молча занижаются. FU-04 обходит это для своих метрик, старые счётчики — отдельная задача.
6. **Два телефона звонят оба.** Принято как ограничение (см. «Уведомления»).
7. **Фото симптомов меняют политику хранения** — поэтому FU-08 отдельно и с правкой политики.

## Открытые вопросы

1. Кто из ветеринаров просмотрит тексты решений `decision.*` и когда? Без этого FU-09 не закрывается.
2. Интервалы 12/48 и 24/72 ч — стартовые. Пересматривать по данным FU-04 через месяц после выпуска?
3. Срок «Перенесённых случаев» в сводке для врача: 6 месяцев или все?
4. Нужен ли отдельный выключатель «Наблюдение после проверки» в профиле или достаточно общего «Напоминания»? План исходит из общего.

## Оценка трудозатрат

| Работа | Дни |
|---|---|
| Дизайн (отдельный агент по брифу) | 2–3 |
| FU-01 | 3–4 |
| FU-02 | 3 |
| FU-03 | 2 |
| FU-04 | 1–1,5 |
| FU-05 | 3 |
| FU-06 | 3 |
| FU-07 | 3–4 |
| FU-08 | 3 + согласование политики |
| FU-09 | 2 |
| **Итого** | **около 25–28 рабочих дней**, из них без FU-08 — 20–23 |

Дизайн идёт параллельно с FU-01 и FU-04. Первый результат для пользователей — сайт после FU-02, примерно через 7–8 рабочих дней от старта.

## Проверенные точки входа

- Проверка: `apps/web/src/server/checks/check-job-service.ts` (`createCheckJob`, `runJob`), `server/symptom-check/analyze-symptom-check.ts` (списание `apply_symptom_check_usage`, контекст медкарты MR-10), `server/checks/check-history-service.ts`, `app/(backend)/api/v1/checks/**`, `api/symptom-check/route.ts`.
- Контракты: `packages/contracts/src/check.ts` (строгая `SymptomCheckRecordSchema`), `analysis.ts` (строгая `CheckCreateInputSchema`), `pet.ts` (`FEATURES_HEADER`, `PET_DATES_FEATURE`, `PET_AVATAR_FEATURE`), `openapi.ts`.
- Признак клиента: `apps/web/src/server/pets/pet-contract.ts` (`reads`, `petFor`), `packages/shared/src/api-client.ts:219`.
- Отзыв по проверке как образец отдельного ресурса: `supabase/migrations/20260923120000_feedback_per_check.sql`, `v1/checks/[id]/feedback`, `ResultFeedback.tsx` (оба клиента).
- Визиты: `pet_health_events.check_id`, `apps/mobile/app/(tabs)/pets/[id]/visit-form.tsx` (`checkId`), `apps/web/src/features/medical-record/visits/`.
- Напоминания: `apps/mobile/src/features/medical-record/reminders/` (`sync.ts`, `schedule.ts`, `doses.ts`, `notifications.ts`, `ReminderProvider.tsx`, `device-store.ts`).
- Кредиты: `apps/web/src/features/credits/`, `server/extra-check/extra-check-service.ts`.
- Удаление: `docs/architecture/deletion-data-map.md`, `supabase/migrations/20260917120000_deletion_worker.sql` (`delete_account_data`), `apps/web/src/server/account/deletion-worker.ts`.
- Статистика: `apps/web/src/server/admin/statistics.ts`, `features/admin/AdminStatisticsClient.tsx`.

Корни проверены 25 октября 2026 на `22034ea`. Исполнитель повторно проверяет их перед изменениями.

## Статус

Все этапы запланированы, ни один не реализован. Дизайн ещё не заказан. Начальная порция работы для другого агента: **FU-01** (не ждёт дизайна), параллельно — дизайн по брифу.
