# Админка: активность, проверки, фидбэк — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/statistics` превращается в четыре вкладки (Обзор, Пользователи, Проверки, Фидбэк) с плашками «к прошлому периоду», графиками и лентами. Весь счёт идёт в SQL, поэтому лимит в 1000 строк больше не искажает цифры.

**Architecture:**
- **SQL.** Шесть функций `public.admin_*` возвращают `jsonb`: четыре со статистикой по вкладкам и две ленты. Все — `security definer`, `execute` только у `service_role`.
- **Сервер.** Тонкий слой в `apps/web/src/server/admin/` вызывает функцию и приводит ответ к типам из `shared/types/admin.ts`.
- **Страницы.** Каждая вкладка — серверная страница со своей проверкой роли. Графики — клиентские компоненты на Recharts. Ленты рендерятся на сервере. Раскрытие проверки — нативный `<details>`, «Показать ещё» — ссылка с бо́льшим `?shown=`. Клиентских запросов и серверных действий нет.

**Tech Stack:** Supabase Postgres (plpgsql/sql), Next.js 16 (App Router, серверные компоненты), Recharts 3, Vitest (unit + integration на локальном Supabase).

**Spec:** [docs/superpowers/specs/2026-11-05-admin-dashboard-design.md](../specs/2026-11-05-admin-dashboard-design.md). Исполнитель читает спеку целиком: определения метрик (активация, возвраты, «активный», когорты) и правила сравнения — там, план их не повторяет.

## Global Constraints

- **Доступ.** Каждая функция `admin_*`: `security definer`, `set search_path = public`, `revoke all … from public, anon, authenticated`, `grant execute … to service_role`. Каждая страница `/admin/statistics/**` сама вызывает охрану: не-админ → `/dashboard`, вышедший → `/login?next=<текущий путь с ?days>`.
- **Кого считаем.** Строки пользователей с `profiles.status <> 'active'` не считаются нигде. Удалённые проверки (`deleted_at is not null`) в счёте участвуют, из лент исключаются. Админов, тестовые и ревью-аккаунты не исключаем.
- **Окна.**
  - Текущее: `[p_now − p_days·24ч, p_now)`, предыдущее: `[p_now − 2·p_days·24ч, p_now − p_days·24ч)`.
  - «Активные за 7 дней» сравнивают `[p_now−7д, p_now)` и `[p_now−14д, p_now−7д)` при любом периоде.
  - Графики идут по датам `Europe/Moscow`, последняя дата — сегодняшняя московская.
- **Время.** Колонки `timestamp` без пояса (`symptom_checks.created_at`, `profiles.created_at`) хранят UTC: перед сравнением с `timestamptz` — `created_at at time zone 'UTC'`.
- **«Нет данных».** `prev` = `null`, когда самая ранняя строка таблицы-источника метрики позже начала предыдущего окна. Источники:
  - регистрации → `profiles`;
  - проверки и активность → `symptom_checks`;
  - сбои → `check_jobs`;
  - оценки → `user_feedback`;
  - просьбы → `extra_check_requests`.
- **Ленты.** Без имени, почты и id пользователя, без имени питомца. Лимит по умолчанию 50, шаг 50, максимум 500. «Показать ещё» увеличивает `?shown=` вместо курсора из спеки: поведение для владельца то же, а страница остаётся серверной, без клиентских запросов.
- **Тексты.** Все новые тексты — в `ru.ts` и `en.ts`, срез `admin`. На каждой вкладке сноска: ru «Удалённые аккаунты не учитываются. Входы в приложение не записываются: «активный» — тот, кто что-то сделал.», en «Deleted accounts are not counted. Sign-ins are not logged: “active” means the person did something.»
- **Миграции.** Это четыре новых файла `supabase/migrations/2026110512xxxx_admin_*.sql`. Перед созданием сверить, что метки свободны на общем локальном стеке. Применять `supabase migration up --local`, без `db reset`: он ломает storage.
- **Next.js 16.** Перед правкой страниц прочитать `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` и `04-linking-and-navigating.md` (`searchParams` — это `Promise`).

## Review Focus

1. **Граница московских суток.** Проверка в `2026-11-04 21:30 UTC` должна попасть на дату `2026-11-05`, а в UTC-счёте попала бы на `2026-11-04`. Тест в Task 1.
2. **Больше 1000 строк.** 1200 проверок за период дают `checks.cur = 1200`. Тест в Task 1.
3. **Ноль в прошлом периоде и молодой источник.** `prev = 0` при существующем источнике даёт «новое». Источник младше начала прошлого окна даёт `prev = null` и «нет данных». Тесты в Task 1 (SQL) и Task 6 (отображение).
4. **Вызов функции не админом.** Роль `authenticated` получает `permission denied` на каждую `admin_*`. Тест в Task 1, остальные функции добавляются в тот же цикл в Tasks 2–4.
5. **Мусор в `?days`, `?filter`, `?shown`.** `?days=14`, `?filter=<script>`, `?shown=99999`, `?shown=-1` не роняют страницу и приводятся к значениям по умолчанию или к границам. Тест в Task 5.

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `supabase/migrations/20261105120000_admin_overview_stats.sql` | `admin_msk_date`, `admin_activity`, `admin_overview_stats` |
| `supabase/migrations/20261105120100_admin_users_stats.sql` | `admin_users_stats` |
| `supabase/migrations/20261105120200_admin_checks_stats.sql` | `admin_check_row`, `admin_checks_stats`, `admin_check_feed` |
| `supabase/migrations/20261105120300_admin_feedback_stats.sql` | `admin_feedback_stats`, `admin_feedback_feed` |
| `apps/web/tests/integration/admin-statistics-sql.test.ts` | все SQL-функции на живой локальной базе |
| `apps/web/tests/integration/schema.test.ts` | + новые имена в `REQUIRED_FUNCTIONS` |
| `apps/web/src/shared/types/admin.ts` | типы ответов (переписать; follow-up-типы оставить) |
| `apps/web/src/server/admin/map.ts` | разбор `jsonb` → типы |
| `apps/web/src/server/admin/statistics.ts` | сервисы вкладок и лент, нормализация параметров (переписать) |
| `apps/web/src/server/admin/admin-page.ts` | охрана страницы и параметры URL |
| `apps/web/src/features/admin/change.ts` | изменение к прошлому периоду (чистая логика) |
| `apps/web/src/features/admin/*.tsx` | компоненты вкладок (см. Tasks 7–10) |
| `apps/web/src/app/(frontend)/admin/statistics/{page,users/page,checks/page,feedback/page}.tsx` | четыре вкладки |
| `apps/web/src/app/styles/pages.css` | стили админки (блок `Admin statistics`) |

## Форма ответов SQL (общий контракт Tasks 1–5)

- **Metric:** `{"cur": n, "prev": n | null}`.
- **Ratio:** `{"cur": {"num": n, "den": n}, "prev": {"num": n, "den": n} | null}`.
- **Даты** в `daily` и `week_start` — строки `YYYY-MM-DD` (московские). Время в лентах — ISO `timestamptz`.

---

### Task 1: SQL — помощники и Обзор

**Files:**
- Create: `supabase/migrations/20261105120000_admin_overview_stats.sql`
- Create: `apps/web/tests/integration/admin-statistics-sql.test.ts`
- Modify: `apps/web/tests/integration/schema.test.ts` (`REQUIRED_FUNCTIONS`)

**Interfaces:**
- Produces:
  - `public.admin_msk_date(p_at timestamptz) returns date` (immutable).
  - `public.admin_activity(p_from timestamptz, p_to timestamptz) returns table(user_id uuid, at timestamptz)`: объединение `symptom_checks`, `check_jobs`, `pet_weights`, `pet_health_events`, `pet_medications`, `medication_doses`, `followup_checkins`, `user_feedback` по `created_at`, только пользователи со `status = 'active'`.
  - `public.admin_overview_stats(p_now timestamptz, p_days int) returns jsonb`:
    `{"new_users": Metric, "active_7d": Metric, "checks": Metric, "helpful": Ratio (num = liked, den = все оценки по coalesce(updated_at, created_at)), "failures": Ratio (num = check_jobs failed, den = все check_jobs), "extra_requests": Metric, "daily": [{"date", "registrations", "checks"}]}`. В `daily` ровно `p_days` элементов.
  - В тестовом файле — помощник `seedAdmin(db)` и вставки `insertCheck(db, {userId, petId?, urgency, at, deletedAt?, answers?})`, `insertFeedback(db, {userId, checkId?, rating, comment?, at})`. Tasks 2–4 используют их.

- [ ] **Step 1: Написать падающие тесты** в `admin-statistics-sql.test.ts`. Фикстура — `seedFixtures` из `./fixtures`, функции вызываются от `postgres` через `db.query('select public.admin_overview_stats($1, $2) as r', [NOW, 30])`, `NOW = '2026-11-05T12:00:00Z'`.
  - `counts more than 1000 checks`: 1200 проверок через `generate_series` в окне → `r.checks.cur === 1200` (плюс проверки фикстуры, если попадают в окно; фикстурные датированы маем 2026, а 90-дневное окно до 2026-11-05 их не захватывает).
  - `puts a check made at 21:30 UTC on the next Moscow day`: проверка в `2026-11-04 21:30` → в `daily` у `2026-11-05` `checks === 1`, у `2026-11-04` — `0`.
  - `daily has exactly p_days Moscow dates ending today`: `r.daily.length === 30`, `r.daily.at(-1).date === '2026-11-05'`.
  - `prev is null when the source is younger than the previous window`: удалить все `check_jobs`, вставить один в `2026-11-01` → при `p_days = 30` `r.failures.prev === null`.
  - `prev is 0, not null, when the source existed`: `check_jobs` в `2026-01-01` и ни одного в прошлом окне → `r.failures.prev` равно `{num: 0, den: 0}`.
  - `does not count accounts that are being deleted`: `update profiles set status = 'deleting'` у OWNER_B → его проверки и регистрация пропадают из `checks.cur`, `new_users.cur`, `daily`.
  - `counts soft-deleted checks`: проверка с `deleted_at = now()` в окне учитывается в `checks.cur`.
  - `denies every admin function to authenticated`: в транзакции `set local role authenticated`, вызов → ошибка с `permission denied`. Тест параметризован списком `ADMIN_FUNCTIONS`, пока это `['admin_overview_stats(now(), 30)', 'admin_activity(now() - interval \'1 day\', now())']`.
  - В `schema.test.ts` добавить `admin_activity`, `admin_msk_date`, `admin_overview_stats` в `REQUIRED_FUNCTIONS` (по алфавиту).

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm run test:integration --workspace apps/web -- admin-statistics-sql schema`
Expected: FAIL, `function public.admin_overview_stats(...) does not exist`.

- [ ] **Step 3: Написать миграцию.** Шапка-комментарий по образцу `20261025120000_followup_cases.sql`: зачем и почему в SQL. В функциях стоит `language sql stable` там, где хватает одного запроса, иначе plpgsql. Окна и «нет данных» — по Global Constraints. Права — по Global Constraints, включая `admin_activity` и `admin_msk_date`.

- [ ] **Step 4: Применить и прогнать**

Run: `supabase migration up --local && npm run test:integration --workspace apps/web -- admin-statistics-sql schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105120000_admin_overview_stats.sql apps/web/tests/integration/admin-statistics-sql.test.ts apps/web/tests/integration/schema.test.ts
git commit -m "Admin: overview statistics counted in SQL"
```

### Task 2: SQL — Пользователи

**Files:**
- Create: `supabase/migrations/20261105120100_admin_users_stats.sql`
- Modify: `apps/web/tests/integration/admin-statistics-sql.test.ts`, `schema.test.ts`

**Interfaces:**
- Consumes: `admin_activity`, `admin_msk_date`, помощники теста из Task 1.
- Produces: `public.admin_users_stats(p_now timestamptz, p_days int) returns jsonb`:
  ```
  {"accounts": {"total": n, "added": n},
   "dau_avg": {"cur": number, "prev": number | null},   -- различные пары (user, московская дата) в окне / p_days
   "active_7d": Metric,
   "activation": Ratio,   -- den: зарегистрированы в окне и created_at + 7д <= p_now; num: из них с проверкой в течение 7д
   "returning": Ratio,    -- den: с ≥1 проверкой в окне; num: из них с ≥2 проверками, created_at < конца окна
   "daily": [{"date", "registrations", "active"}],
   "providers": {"<provider>": n},   -- провайдер самой ранней auth.identities пользователя
   "locales": {"<locale>": n},
   "cohorts": [{"week_start": "YYYY-MM-DD", "size": n, "active": [n | null, ×5]}]}
  ```
  Когорты — 8 московских недель с понедельника, последняя — текущая. `active[k]` = `null`, если неделя k ещё не закончилась (`week_start + 7·(k+1) > сегодня`).

- [ ] **Step 1: Падающие тесты**
  - `activation counts only registrations old enough`: пользователь, зарегистрированный за 3 дня до `NOW`, не входит в `den`; зарегистрированный за 10 дней с проверкой через 2 дня входит в `num` и `den`.
  - `returning counts people with a second check`: OWNER_A с двумя проверками в окне → `num` 1, OWNER_B с одной → `den` 2.
  - `provider is the earliest identity`: у пользователя с identities `email` (раньше) и `apple` (позже) — в `providers.email`. Identities вставлять в `auth.identities` напрямую.
  - `cohort cells of unfinished weeks are null`: у последней когорты `active[0] === null`, у когорты 5 недель назад `active[4]` — число.
  - Добавить `admin_users_stats(now(), 30)` в `ADMIN_FUNCTIONS` и в `REQUIRED_FUNCTIONS`.

- [ ] **Step 2: Тесты падают** (`npm run test:integration --workspace apps/web -- admin-statistics-sql`): `does not exist`.
- [ ] **Step 3: Миграция с `admin_users_stats`.** `auth.identities` читается внутри `security definer` функции.
- [ ] **Step 4: Применить и прогнать** (`supabase migration up --local && npm run test:integration --workspace apps/web -- admin-statistics-sql schema`): PASS.
- [ ] **Step 5: Commit** `Admin: users statistics — activation, returns, cohorts`.

### Task 3: SQL — Проверки и лента проверок

**Files:**
- Create: `supabase/migrations/20261105120200_admin_checks_stats.sql`
- Modify: тестовый файл, `schema.test.ts`

**Interfaces:**
- Produces:
  - `public.admin_check_row(p_check public.symptom_checks) returns jsonb` (stable) — одна строка ленты:
    `{"id", "created_at", "species": "cat"|"dog"|null, "pet_age_years": n|null, "symptoms", "urgency", "urgency_reason", "possible_causes": [], "home_care_steps": [], "vet_questions": [], "answers": {"appetite", "activity", "duration", "stool", "pain_signs": []}, "rating": "liked"|"disliked"|null, "comment": text|null}`.
    Возраст — полных лет на дату проверки по `pets.birth_date`, иначе `pets.age_years`.
  - `public.admin_checks_stats(p_now timestamptz, p_days int) returns jsonb`:
    ```
    {"checks": Metric, "species": {"cat", "dog", "unknown"},
     "per_user": Ratio (num = проверки, den = различные пользователи),
     "failures": Ratio, "failure_codes": {"<error_code>": n},
     "extra_requests": Metric, "extra_approved": n,
     "daily": [{"date", "emergency", "urgent", "monitor", "home_care", "healthy"}],
     "answers": {"total": n,
       "appetite": {"normal","reduced","none","unanswered"},
       "activity": {"normal","low","lethargic","unanswered"},
       "duration": {"today","2-3days","4-7days","week+","unanswered"},
       "stool": {"normal","loose","absent","bloody","unanswered"},
       "pain": {"tense","hunched","grimace","touch_sensitive","hiding","vocalizing","any"}}}
    ```
  - `public.admin_check_feed(p_now timestamptz, p_days int, p_filter text, p_limit int) returns jsonb`: `{"rows": [admin_check_row…], "has_more": bool}`. Порядок `created_at desc, id desc`. Фильтр `'all' | 'urgent'` (emergency + urgent) `| 'disliked'`, неизвестный трактуется как `'all'`. `p_limit` зажимается в `[1, 500]`. Без `deleted_at` и неактивных аккаунтов.

- [ ] **Step 1: Падающие тесты**
  - `species unknown for a check without a pet`: проверка с `pet_id = null` → `species.unknown === 1`.
  - `answers count unanswered`: проверка с `full_response = '{}'` → `answers.appetite.unanswered === 1`; с `pain_signs: ['tense','hiding']` → `pain.tense === 1`, `pain.any === 1`.
  - `feed hides deleted checks and filters disliked`: удалённая проверка не в `rows`; фильтр `disliked` возвращает только проверку с оценкой `disliked`.
  - `feed has_more and clamps the limit`: 3 проверки, `p_limit = 2` → 2 строки, `has_more === true`; `p_limit = 9999` работает как 500.
  - `feed row carries no user identity`: `Object.keys(row)` не содержит `user_id`, `email`, `pet_name`.
  - Добавить новые функции в `ADMIN_FUNCTIONS` и `REQUIRED_FUNCTIONS`.
- [ ] **Step 2: Тесты падают** (`npm run test:integration --workspace apps/web -- admin-statistics-sql`).
- [ ] **Step 3: Миграция.**
- [ ] **Step 4: Применить и прогнать**: PASS.
- [ ] **Step 5: Commit** `Admin: checks statistics and the check feed`.

### Task 4: SQL — Фидбэк и лента комментариев

**Files:**
- Create: `supabase/migrations/20261105120300_admin_feedback_stats.sql`
- Modify: тестовый файл, `schema.test.ts`

**Interfaces:**
- Consumes: `admin_check_row` (Task 3).
- Produces:
  - `public.admin_feedback_stats(p_now timestamptz, p_days int) returns jsonb`:
    `{"ratings": Metric, "liked": Ratio (num = liked, den = ratings), "rated_checks": Ratio (num = проверки окна с оценкой, den = проверки окна), "with_comment": Metric, "daily": [{"date", "liked", "disliked"}], "by_urgency": {"emergency"|"urgent"|"monitor"|"home_care"|"healthy": {"liked": n, "rated": n}}}`.
    Время оценки — `coalesce(updated_at, created_at)`.
  - `public.admin_feedback_feed(p_now timestamptz, p_days int, p_filter text, p_limit int) returns jsonb`: `{"rows": [{"id", "at", "rating", "comment", "check": admin_check_row | null}], "has_more": bool}`. Только непустые после `btrim` комментарии. Фильтр `'all' | 'disliked' | 'liked'`. Лимит — как в Task 3. Удалённая проверка даёт `check = null`.

- [ ] **Step 1: Падающие тесты**
  - `a changed rating counts at its update time`: оценка создана 40 дней назад, обновлена 2 дня назад → входит в `ratings.cur` при `p_days = 30`.
  - `by_urgency counts only ratings tied to a check`: старая оценка без `symptom_check_id` не попадает в `by_urgency`, но попадает в `ratings`.
  - `feed skips blank comments`: комментарий `'   '` не в `rows`.
  - `old feedback has no check`: строка без `symptom_check_id` → `check === null`.
  - Добавить функции в `ADMIN_FUNCTIONS` и `REQUIRED_FUNCTIONS`.
- [ ] **Step 2: Тесты падают.**
- [ ] **Step 3: Миграция.**
- [ ] **Step 4: Применить и прогнать**: PASS.
- [ ] **Step 5: Commit** `Admin: feedback statistics and the comment feed`.

### Task 5: Типы, разбор ответов, сервисы

**Files:**
- Modify: `apps/web/src/shared/types/admin.ts` — добавить новые типы; старые удалит Task 7.
- Create: `apps/web/src/server/admin/map.ts`
- Modify: `apps/web/src/server/admin/statistics.ts` — добавить новые сервисы; `mapFollowupStatistics` остаётся.
- Modify: `apps/web/tests/server/admin/statistics.test.ts` — добавить тесты новых сервисов.

**Interfaces:**
- Consumes: формы `jsonb` из Tasks 1–4.
- Produces (типы в `shared/types/admin.ts`):
  - `AdminMetric = { cur: number; prev: number | null }`
  - `AdminRatioPart = { num: number; den: number }`, `AdminRatio = { cur: AdminRatioPart; prev: AdminRatioPart | null }`
  - `AdminOverview`, `AdminUsers`, `AdminChecks` (включая `followup: AdminFollowupStatistics`), `AdminFeedback` — поля в camelCase, один к одному с `jsonb`. Ключи вроде `2-3days` и `week+` остаются ключами записи.
  - `AdminCheckRow`, `AdminFeedbackRow` (`check: AdminCheckRow | null`), `AdminFeed<T> = { rows: T[]; hasMore: boolean }`
  - `AdminCheckFeedFilter = 'all' | 'urgent' | 'disliked'`, `AdminFeedbackFeedFilter = 'all' | 'disliked' | 'liked'`
- Produces (`server/admin/statistics.ts`):
  - `normalizeAdminStatisticsPeriod(value: unknown): AdminStatisticsPeriod` (как сейчас)
  - `normalizeCheckFeedFilter(value: unknown): AdminCheckFeedFilter`, `normalizeFeedbackFeedFilter(value: unknown): AdminFeedbackFeedFilter`
  - `normalizeFeedShown(value: unknown): number` — кратно 50, от 50 до 500, по умолчанию 50.
  - `getAdminOverview(days, now = new Date()): Promise<AdminOverview>`, `getAdminUsers(...)`, `getAdminChecks(...)` (параллельно вызывает `admin_checks_stats` и `admin_followup_statistics`), `getAdminFeedback(...)`
  - `getAdminCheckFeed(days, filter, shown, now?): Promise<AdminFeed<AdminCheckRow>>`, `getAdminFeedbackFeed(days, filter, shown, now?): Promise<AdminFeed<AdminFeedbackRow>>`
  - Все бросают `Error('Failed to load admin statistics <name>: <message>')` при ошибке RPC (как `ensureNoError`).
- `map.ts`: `toMetric(raw: unknown): AdminMetric`, `toRatio(raw: unknown): AdminRatio`, `toCounts<K extends string>(raw: unknown, keys: readonly K[]): Record<K, number>` (недостающий ключ → 0), `toDaily<K extends string>(raw: unknown, keys: readonly K[]): ({ date: string } & Record<K, number>)[]`, `toCheckRow(raw: unknown): AdminCheckRow`.

- [ ] **Step 1: Падающие тесты** в `statistics.test.ts` (мок `createServiceClient().rpc` как сейчас):
  - `normalizes feed parameters`: `normalizeFeedShown('99999') === 500`, `('-1') === 50`, `('120') === 100`, `(undefined) === 50`; `normalizeCheckFeedFilter('<script>') === 'all'`, `('urgent') === 'urgent'`; `normalizeAdminStatisticsPeriod('14') === 30`.
  - `calls admin_overview_stats with now and days`: `rpc` вызван с `('admin_overview_stats', { p_now: '2026-05-02T12:00:00.000Z', p_days: 7 })`.
  - `maps a null prev and missing counts`: ответ `{checks: {cur: 3, prev: null}, species: {cat: 2}}` → `checks.prev === null`, `species.dog === 0`.
  - `getAdminChecks includes follow-up`: два вызова `rpc`, результат содержит `followup.rows.length === 4`.
  - `throws on an RPC error`: `rejects.toThrow('Failed to load admin statistics admin_users_stats')`.
  - Тест `mapFollowupStatistics` оставить.
- [ ] **Step 2: Тесты падают** (`npm test --workspace apps/web -- tests/server/admin`).
- [ ] **Step 3: Реализовать** типы, `map.ts`, сервисы.
- [ ] **Step 4: Прогнать** `npm test --workspace apps/web -- tests/server/admin && npm run typecheck --workspace apps/web`: PASS. Чтобы старая страница компилировалась до Task 7, в этой задаче старые `getAdminStatistics`, `buildAdminStatistics`, `AdminStatistics*` и их тест **не удаляются**: новое добавляется рядом. Удаляет их Task 7 вместе с `AdminStatisticsClient.tsx`.
- [ ] **Step 5: Commit** `Admin: typed services over the SQL statistics`.

### Task 6: Изменение к прошлому периоду

**Files:**
- Create: `apps/web/src/features/admin/change.ts`
- Test: `apps/web/tests/unit/features/admin/change.test.ts`

**Interfaces:**
- Produces:
  - `type AdminChange = { kind: 'up' | 'down' | 'flat'; value: number; unit: 'percent' | 'points' | 'count' } | { kind: 'new' } | { kind: 'nodata' }`
  - `metricChange(m: AdminMetric, unit?: 'percent' | 'count'): AdminChange`: по умолчанию проценты, округлённые до целого; `'count'` — разница в штуках (для «просьб о доп. проверке»).
  - `ratioChange(r: AdminRatio): AdminChange` — процентные пункты между долями, округлённые до целого.
  - `ratioValue(p: AdminRatioPart): number | null` — доля 0..1 или `null` при `den = 0`.

- [ ] **Step 1: Падающие тесты**
  - `metricChange({cur: 118, prev: 100})` → `{kind: 'up', value: 18, unit: 'percent'}`
  - `metricChange({cur: 96, prev: 100})` → `{kind: 'down', value: 4, unit: 'percent'}`
  - `metricChange({cur: 100, prev: 100})` → `kind: 'flat'`; `({cur: 1001, prev: 1000})` (0,1 %) → `'flat'`
  - `metricChange({cur: 5, prev: 0})` → `{kind: 'new'}`; `({cur: 0, prev: 0})` → `'flat'`
  - `metricChange({cur: 5, prev: null})` → `{kind: 'nodata'}`
  - `metricChange({cur: 23, prev: 14}, 'count')` → `{kind: 'up', value: 9, unit: 'count'}`
  - `ratioChange({cur: {num: 82, den: 100}, prev: {num: 79, den: 100}})` → `{kind: 'up', value: 3, unit: 'points'}`
  - `ratioChange` с `cur.den = 0` или `prev.den = 0` → `{kind: 'nodata'}`
- [ ] **Step 2: Тесты падают.** (`npm test --workspace apps/web -- change`)
- [ ] **Step 3: Реализовать.**
- [ ] **Step 4: Тесты проходят.**
- [ ] **Step 5: Commit** `Admin: change against the previous period`.

### Task 7: Каркас вкладок и Обзор

**Files:**
- Create: `apps/web/src/server/admin/admin-page.ts`
- Create: `apps/web/src/features/admin/AdminFrame.tsx` — шапка с заголовком, вкладки, период, сноска
- Create: `apps/web/src/features/admin/StatTile.tsx`
- Create: `apps/web/src/features/admin/DailyChart.tsx` (`'use client'`) — обобщение нынешнего `StatisticsChart`
- Create: `apps/web/src/features/admin/CommentList.tsx` — список комментариев; на Обзоре 3 строки без фильтров
- Delete: `apps/web/src/features/admin/AdminStatisticsClient.tsx` (follow-up-таблицу сначала перенести в `FollowupTable.tsx`: этот файл создаётся здесь, а на страницу ставится в Task 9)
- Modify: `apps/web/src/server/admin/statistics.ts`, `shared/types/admin.ts`, `tests/server/admin/statistics.test.ts` — удалить `getAdminStatistics`, `buildAdminStatistics`, `AdminStatisticsTotals`, `AdminStatisticsDailyPoint`, `AdminStatistics` и их тест
- Modify: `apps/web/src/app/(frontend)/admin/statistics/page.tsx`
- Modify: `apps/web/src/shared/i18n/dictionaries/ru.ts`, `en.ts` (срез `admin`)
- Modify: `apps/web/src/app/styles/pages.css`
- Test: `apps/web/tests/unit/features/admin/frame.test.tsx`, `stat-tile.test.tsx` (через `tests/unit/components/static-render.tsx`)

**Interfaces:**
- Consumes: `getAdminOverview`, `getAdminFeedbackFeed(days, 'all', 50)` (берутся первые 3 строки), `metricChange`/`ratioChange`/`ratioValue`, `loadAdminUser`, `requireCabinet`.
- Produces:
  - `type AdminTab = 'overview' | 'users' | 'checks' | 'feedback'`
  - `adminTabHref(tab: AdminTab, days: AdminStatisticsPeriod, extra?: Record<string, string>): string` — `/admin/statistics`, `/admin/statistics/users`… с `?days=`
  - `loadAdminPage(tab: AdminTab, searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<{ cabinet: CabinetUser; days: AdminStatisticsPeriod; params: Record<string, string | string[] | undefined> }>` — нормализует `days`, редиректит не-админа на `/dashboard`, вышедшего — на `/login?next=<adminTabHref(tab, days)>`, затем `requireCabinet`.
  - `<AdminFrame tab days>{children}</AdminFrame>` — ссылки вкладок с `aria-current="page"`, переключатель периода (ведёт на ту же вкладку), сноска из Global Constraints.
  - `<StatTile label value change />`, где `value: string`, `change: AdminChange`. Стрелка и текст: ru «▲ 18% к прошлым 30 дням», «▼ 3 п.п.», «▲ 9», «новое», «нет данных»; en — аналогично.
  - `<DailyChart title series={[{key, label, color}]} data stacked? />`

- [ ] **Step 1: Падающие тесты**
  - `frame.test.tsx`: `render(<AdminFrame tab="users" days={7}>x</AdminFrame>)` содержит ссылку `/admin/statistics/users?days=7` с `aria-current="page"`, ссылки периода `/admin/statistics/users?days=30` и сноску «Удалённые аккаунты не учитываются».
  - `stat-tile.test.tsx`: `{kind: 'nodata'}` → «нет данных»; `{kind: 'up', value: 18, unit: 'percent'}` при `days = 30` → «▲ 18%»; `{kind: 'down', value: 3, unit: 'points'}` → «▼ 3 п.п.».
  - `adminTabHref('overview', 30) === '/admin/statistics?days=30'`.
- [ ] **Step 2: Тесты падают.**
- [ ] **Step 3: Реализовать.** Обзор: шесть плашек в порядке спеки, `DailyChart` (регистрации + проверки), три комментария со ссылкой на вкладку «Фидбэк». Тексты — ru и en. Цвета графиков берутся из `CHART` в нынешнем клиенте: Recharts не понимает `var(--…)`.
- [ ] **Step 4: Прогнать** `npm test --workspace apps/web -- admin && npm run typecheck --workspace apps/web && npm run lint --workspace apps/web`: PASS.
- [ ] **Step 5: Commit** `Admin: tabs frame and the overview tab`.

### Task 8: Вкладка «Пользователи»

**Files:**
- Create: `apps/web/src/app/(frontend)/admin/statistics/users/page.tsx`
- Create: `apps/web/src/features/admin/ShareBars.tsx` — горизонтальные полосы «подпись — доля — число»
- Create: `apps/web/src/features/admin/CohortTable.tsx`
- Modify: словари, `pages.css`
- Test: `apps/web/tests/unit/features/admin/cohort-table.test.tsx`

**Interfaces:**
- Consumes: `loadAdminPage('users', …)`, `getAdminUsers`, `AdminFrame`, `StatTile`, `DailyChart`.
- Produces:
  - `<ShareBars items={[{label, count}]} />` — доли от суммы, используется и в Task 9.
  - `<CohortTable cohorts={AdminUsers['cohorts']} />`

- [ ] **Step 1: Падающий тест** `cohort-table.test.tsx`: когорта `{weekStart: '2026-09-14', size: 40, active: [24, 8, null, null, null]}` → ячейки «60%», «20%», три пустые; дата недели — «14–20 сен».
- [ ] **Step 2: Тест падает.**
- [ ] **Step 3: Реализовать страницу.**
  - Плашки: аккаунты («1 284», подпись «+142 за период»), активные за день, активные за 7 дней, активация, возвраты.
  - График: регистрации и активные.
  - `ShareBars` по способу входа: подписи `apple` → «Apple», `google` → «Google», `custom:yandex` → «Яндекс», `email` → «Почта», неизвестный провайдер — как есть. Ещё одни `ShareBars` — по языку.
  - `CohortTable`.
- [ ] **Step 4: Прогнать** unit, typecheck, lint: PASS.
- [ ] **Step 5: Commit** `Admin: users tab`.

### Task 9: Вкладка «Проверки» и лента

**Files:**
- Create: `apps/web/src/app/(frontend)/admin/statistics/checks/page.tsx`
- Create: `apps/web/src/features/admin/CheckFeed.tsx` — серверный компонент: фильтры-ссылки, строки `<details>`, «Показать ещё»
- Create: `apps/web/src/features/admin/CheckDetails.tsx` — раскрытая проверка (используется и в Task 10)
- Create: `apps/web/src/features/admin/AnswersBlock.tsx` — анкета через `ShareBars`
- Use: `apps/web/src/features/admin/FollowupTable.tsx` (создан в Task 7)
- Modify: словари, `pages.css`
- Test: `apps/web/tests/unit/features/admin/check-feed.test.tsx`

**Interfaces:**
- Consumes: `getAdminChecks`, `getAdminCheckFeed`, `normalizeCheckFeedFilter`, `normalizeFeedShown`, `adminTabHref`, `ShareBars`, `DailyChart` (`stacked`).
- Produces:
  - `<CheckFeed feed={AdminFeed<AdminCheckRow>} filter days shown />`
  - `<CheckDetails row={AdminCheckRow} />`

- [ ] **Step 1: Падающие тесты** `check-feed.test.tsx`:
  - строка содержит срочность «срочно», «🐈 3 г.», первые 80 символов жалобы, оценку 👎;
  - при `hasMore` есть ссылка «Показать ещё» на `/admin/statistics/checks?days=30&filter=urgent&shown=100`;
  - в разметке нет `user_id`;
  - активный фильтр помечен `aria-current="true"`.
  - Подписи ответов анкеты — из существующих ключей словаря (`appetiteNormal`…`painVocalizing`). Тест: `appetite.none` отображается как «Не ест».
- [ ] **Step 2: Тесты падают.**
- [ ] **Step 3: Реализовать страницу.**
  - Плашки: проверки, доли кошек / собак / неизвестно, проверок на пользователя (`num/den` с одним знаком), сбои с разбивкой по `error_code`, просьбы и сколько одобрено.
  - График по срочности (`stacked`), цвета срочностей из `CHART`.
  - Анкета, лента, `FollowupTable`.
  - Время в ленте — по Москве, формат «5 ноя, 11:42».
- [ ] **Step 4: Прогнать** unit, typecheck, lint: PASS.
- [ ] **Step 5: Commit** `Admin: checks tab with the check feed`.

### Task 10: Вкладка «Фидбэк»

**Files:**
- Create: `apps/web/src/app/(frontend)/admin/statistics/feedback/page.tsx`
- Modify: `apps/web/src/features/admin/CommentList.tsx` — фильтры, «Показать ещё», раскрытие через `CheckDetails`, «без проверки»
- Modify: словари, `pages.css`
- Test: `apps/web/tests/unit/features/admin/comment-list.test.tsx`

**Interfaces:**
- Consumes: `getAdminFeedback`, `getAdminFeedbackFeed`, `normalizeFeedbackFeedFilter`, `normalizeFeedShown`, `CheckDetails`, `ShareBars`, `DailyChart`.

- [ ] **Step 1: Падающий тест**: строка с `check: null` показывает «без проверки» и не содержит `<details>`; строка с проверкой содержит `<details>` со срочностью; фильтр `liked` даёт ссылку `?days=30&filter=liked`.
- [ ] **Step 2: Тест падает.**
- [ ] **Step 3: Реализовать страницу.**
  - Плашки: оценки, доля 👍, проверки с оценкой, с комментарием.
  - График 👍/👎 (`stacked`).
  - Доля 👍 по срочности: полоса на каждую срочность, где `rated > 0`; при `rated < 10` вместо процента «n < 10», как в таблице цикла наблюдения.
  - Комментарии.
- [ ] **Step 4: Прогнать** unit, typecheck, lint: PASS.
- [ ] **Step 5: Commit** `Admin: feedback tab`.

### Task 11: Проверка в браузере и отчёт

**Files:**
- Create: `docs/verification/admin-dashboard.md`
- Modify (если нужно): `.claude/launch.json` — запись `web-local-prod`: `set -a; . apps/web/.env.integration; set +a; cd apps/web && npx next build && exec npx next start -p 3210`. В панели браузера `next dev` не гидрирует, а графикам гидрация нужна.

- [ ] **Step 1: Полный прогон.** `npm test --workspace apps/web && npm run test:integration --workspace apps/web && npm run typecheck --workspace apps/web && npm run lint --workspace apps/web` — всё PASS.
- [ ] **Step 2: Локальные данные.** На локальном стеке пользователю выдаётся `role = 'admin'` (по id), сеется пара десятков проверок и оценок разных дат. Вход — через magic link (рецепт в памяти `local-stack-after-integration-tests`).
- [ ] **Step 3: Пройти в браузере**:
  - четыре вкладки × периоды 7/30/90;
  - фильтры обеих лент;
  - «Показать ещё»;
  - раскрытие проверки;
  - не-админ на `/admin/statistics/checks` уходит на `/dashboard`, вышедший — на `/login?next=…`;
  - узкий экран 375 px без горизонтальной прокрутки страницы (таблицы прокручиваются внутри своих блоков).

  Скриншоты сложить рядом с отчётом, в git их не добавлять.
- [ ] **Step 4: Отчёт** `docs/verification/admin-dashboard.md`: что проверено, команды и их итог, ссылки на скриншоты, порядок выката — миграции `db push` владельцем до merge.
- [ ] **Step 5: Commit** `Admin dashboard: verification report`, затем PR. В описании PR: четыре миграции, «владелец применяет `db push` до merge, иначе страница упадёт».
