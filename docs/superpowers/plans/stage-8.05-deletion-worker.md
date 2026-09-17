# Исполнимый план 8/05 — обработчик удаления аккаунта

> **Для агентов:** реализовывать по одной задаче через `superpowers:subagent-driven-development`
> либо `superpowers:executing-plans`. Шаги отмечаются чекбоксами.

**Цель:** принятая заявка на удаление действительно доводится до конца: данные удалены, финансовые
записи в архиве, пользователь Auth удалён, задача `completed`. При сбое следующий запуск продолжает
с того же места.

**Подход:** шаг с данными — одна SQL-функция в одной транзакции. Шаги и состояние задачи
принадлежат модулю `deletion-worker.ts`, который получает зависимости параметром. Обработка
запускается через `after()` сразу после ответа на заявку и раз в сутки кроном Vercel.

**Стек:** Next.js 16.3 (`after`, Route Handlers), Supabase Postgres 17 и `@supabase/supabase-js`
2.103, vitest 4, интеграционные тесты против локального Supabase.

**Спека:** [2026-09-17-stage-8-05-deletion-worker-design.md](../specs/2026-09-17-stage-8-05-deletion-worker-design.md)

## Общие ограничения

- Ветка `server/stage-8-deletion-worker`. Коммиты по-английски, одним предложением в стиле истории
  репозитория, последняя строка `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Миграция `supabase/migrations/20260917120000_deletion_worker.sql` — номер позже
  `20260910090000`, которая уже применена на production из другой ветки.
- Отзыв Apple-токенов **не делается** (решение владельца 17 сентября 2026).
- Аренда задачи — 120 секунд, предел попыток — 5, крон обрабатывает до 20 задач за запуск,
  расписание `0 3 * * *`, `maxDuration = 60` у маршрута крона.
- Шаги в `progress`: ровно `data` и `auth`. Коды ошибок: ровно `data_step_failed`,
  `auth_step_failed`, `complete_step_failed`.
- Журналы: только код шага. Ни user id, ни email, ни текста ошибки базы, ни секрета квитанции.
- Все новые SQL-функции: `security definer`, `set search_path = public`, `execute` только у
  `service_role` (`revoke all ... from public, anon, authenticated; grant execute ... to service_role`).
- Код в `apps/web/src/server/**` не импортирует `next/*`, кроме файлов из списка `ADAPTERS` в
  `apps/web/tests/server/architecture/service-boundaries.test.ts`.
- Перед изменением маршрутов прочитать `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`
  и раздел про `maxDuration` в `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/`.
- Интеграционные тесты ходят только в локальный Supabase (`db-guard` не пустит в облако). Нужен
  запущенный Docker и `supabase start`.

---

### Задача 1. Миграция: функции обработчика и удаление данных одним шагом

**Файлы:**
- Создать: `supabase/migrations/20260917120000_deletion_worker.sql`
- Изменить: `apps/web/tests/integration/schema.test.ts` (список `REQUIRED_FUNCTIONS`)
- Тесты: `apps/web/tests/integration/deletion-worker-sql.test.ts`

**Интерфейсы:**
- Отдаёт SQL-функции:
  - `claim_deletion_job(p_user_id uuid, p_lease_seconds integer) returns jsonb` — `progress` или `null`;
  - `mark_deletion_step(p_user_id uuid, p_step text) returns void`;
  - `record_deletion_failure(p_user_id uuid, p_error_code text, p_max_attempts integer) returns text` —
    новый статус (`in_progress` или `action_required`);
  - `due_deletion_jobs(p_limit integer) returns setof uuid`;
  - `delete_account_data(p_user_id uuid) returns void`.
- Колонки `deletion_jobs.attempts integer not null default 0`, `deletion_jobs.lease_until timestamptz`.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/integration/deletion-worker-sql.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 8/05, the database half: the functions the deletion worker calls.
 *
 * Every check counts real rows. A function that returns without raising has
 * proved nothing about what it removed.
 */

let db: Client
let seeded: SeededFixtures

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  // The fixture reset truncates the business tables but not these: jobs and
  // archive rows have no foreign key to the users it removes.
  await db.query('delete from public.deletion_jobs')
  await db.query('delete from public.financial_archive')
})

afterAll(async () => {
  await db.end()
})

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql, params)
  return Number(rows[0].n)
}

/** A job exactly as `request_account_deletion` leaves it. */
async function requestDeletion(userId: string): Promise<void> {
  await db.query(`select public.request_account_deletion($1, $2)`, [userId, `receipt-${userId}`])
}

/** Everything the fixtures do not seed but a real, long-lived account can have. */
async function addTheRest(userId: string): Promise<void> {
  const { rows: ledger } = await db.query<{ id: string }>(
    `select id from public.credit_ledger where user_id = $1 and reason = 'usage' order by created_at limit 1`,
    [userId],
  )
  // A spent check points at its ledger row. Deleting the ledger sets this to
  // null — an UPDATE the late-write guard refuses for a `deleting` account,
  // which is why check_jobs have to go first.
  await db.query(
    `insert into public.check_jobs (user_id, status, check_id, usage_ledger_id)
     select $1, 'completed', id, $2 from public.symptom_checks where user_id = $1 limit 1`,
    [userId, ledger[0].id],
  )
  await db.query(
    `insert into public.extra_check_requests (user_id, granted_ledger_id)
     select $1, id from public.credit_ledger where user_id = $1 order by created_at limit 1`,
    [userId],
  )
  await db.query(`insert into public.user_feedback (user_id, rating, comment) values ($1, 'liked', 'fine')`, [
    userId,
  ])
  const { rows: pkg } = await db.query<{ id: string }>(
    `insert into retired.packages (code, name, units, unit_price, amount)
     values ('legacy-' || gen_random_uuid(), 'Legacy', 5, 100, 500) returning id`,
  )
  const { rows: tx } = await db.query<{ id: string }>(
    `insert into retired.transactions (user_id, provider, package_id, units_total, unit_price, amount, currency)
     values ($1, 'dummy', $2, 5, 100, 500, 'RUB') returning id`,
    [userId, pkg[0].id],
  )
  await db.query(
    `insert into retired.transaction_status_events (transaction_id, status) values ($1, 'created'), ($1, 'succeeded')`,
    [tx[0].id],
  )
  await db.query(`insert into retired.credit_transactions (user_id, amount, type) values ($1, 3, 'purchase')`, [
    userId,
  ])
}

async function rowsOf(userId: string): Promise<Record<string, number>> {
  return {
    profiles: await count(`select count(*) n from public.profiles where id = $1`, [userId]),
    pets: await count(`select count(*) n from public.pets where user_id = $1`, [userId]),
    checks: await count(`select count(*) n from public.symptom_checks where user_id = $1`, [userId]),
    jobs: await count(`select count(*) n from public.check_jobs where user_id = $1`, [userId]),
    ledger: await count(`select count(*) n from public.credit_ledger where user_id = $1`, [userId]),
    extra: await count(`select count(*) n from public.extra_check_requests where user_id = $1`, [userId]),
    feedback: await count(`select count(*) n from public.user_feedback where user_id = $1`, [userId]),
    transactions: await count(`select count(*) n from retired.transactions where user_id = $1`, [userId]),
    creditTransactions: await count(`select count(*) n from retired.credit_transactions where user_id = $1`, [
      userId,
    ]),
  }
}

describe('delete_account_data', () => {
  it('removes every row of a long-lived account and archives the money', async () => {
    await addTheRest(seeded.ownerAId)
    await requestDeletion(seeded.ownerAId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])

    expect(await rowsOf(seeded.ownerAId)).toEqual({
      profiles: 0,
      pets: 0,
      checks: 0,
      jobs: 0,
      ledger: 0,
      extra: 0,
      feedback: 0,
      transactions: 0,
      creditTransactions: 0,
    })
    const { rows } = await db.query<{ source: string; n: string }>(
      `select source, count(*) n from public.financial_archive where subject_ref = $1 group by source order by source`,
      [seeded.ownerAId],
    )
    expect(rows.map((row) => [row.source, Number(row.n)])).toEqual([
      ['credit_ledger', 4],
      ['credit_transactions', 1],
      ['transaction_status_events', 2],
      ['transactions', 1],
    ])
    // The Auth user is the worker's next step, not this function's.
    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(1)
    await db.query(`delete from auth.users where id = $1`, [seeded.ownerAId])
  })

  it('leaves the other owner untouched, soft-deleted pet included', async () => {
    const before = await rowsOf(seeded.ownerBId)
    await addTheRest(seeded.ownerAId)
    await requestDeletion(seeded.ownerAId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])

    expect(await rowsOf(seeded.ownerBId)).toEqual(before)
  })

  it('removes soft-deleted pets and checks too', async () => {
    await requestDeletion(seeded.ownerBId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerBId])

    expect(await count(`select count(*) n from public.pets where user_id = $1`, [seeded.ownerBId])).toBe(0)
    expect(await count(`select count(*) n from public.symptom_checks where user_id = $1`, [seeded.ownerBId])).toBe(0)
  })

  it('can run twice without failing or archiving twice', async () => {
    await addTheRest(seeded.ownerAId)
    await requestDeletion(seeded.ownerAId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])
    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])

    expect(await count(`select count(*) n from public.financial_archive where subject_ref = $1`, [seeded.ownerAId])).toBe(8)
  })
})

describe('the job lifecycle functions', () => {
  it('claims a pending job once and reports its progress', async () => {
    await requestDeletion(seeded.ownerAId)

    const first = await db.query<{ p: unknown }>(`select public.claim_deletion_job($1, 120) p`, [seeded.ownerAId])
    const second = await db.query<{ p: unknown }>(`select public.claim_deletion_job($1, 120) p`, [seeded.ownerAId])

    expect(first.rows[0].p).toEqual({})
    expect(second.rows[0].p).toBeNull()
    const { rows } = await db.query(`select status, lease_until > now() leased from public.deletion_jobs where user_id = $1`, [
      seeded.ownerAId,
    ])
    expect(rows[0]).toEqual({ status: 'in_progress', leased: true })
  })

  it('lets a job be claimed again once its lease has run out', async () => {
    await requestDeletion(seeded.ownerAId)
    await db.query(`select public.claim_deletion_job($1, 120)`, [seeded.ownerAId])
    await db.query(`update public.deletion_jobs set lease_until = now() - interval '1 second' where user_id = $1`, [
      seeded.ownerAId,
    ])

    const again = await db.query<{ p: unknown }>(`select public.claim_deletion_job($1, 120) p`, [seeded.ownerAId])

    expect(again.rows[0].p).toEqual({})
  })

  it('records steps in progress', async () => {
    await requestDeletion(seeded.ownerAId)
    await db.query(`select public.mark_deletion_step($1, 'data')`, [seeded.ownerAId])

    const { rows } = await db.query<{ progress: Record<string, string> }>(
      `select progress from public.deletion_jobs where user_id = $1`,
      [seeded.ownerAId],
    )
    expect(Object.keys(rows[0].progress)).toEqual(['data'])
  })

  it('refuses a step name it does not know', async () => {
    await requestDeletion(seeded.ownerAId)

    await expect(db.query(`select public.mark_deletion_step($1, 'storage')`, [seeded.ownerAId])).rejects.toThrow()
  })

  it('counts failures, frees the lease, and gives up after the limit', async () => {
    await requestDeletion(seeded.ownerAId)
    const statuses: string[] = []

    for (let attempt = 0; attempt < 5; attempt++) {
      await db.query(`select public.claim_deletion_job($1, 120)`, [seeded.ownerAId])
      const { rows } = await db.query<{ s: string }>(`select public.record_deletion_failure($1, 'data_step_failed', 5) s`, [
        seeded.ownerAId,
      ])
      statuses.push(rows[0].s)
    }

    expect(statuses).toEqual(['in_progress', 'in_progress', 'in_progress', 'in_progress', 'action_required'])
    const { rows } = await db.query(`select attempts, error_code, lease_until from public.deletion_jobs where user_id = $1`, [
      seeded.ownerAId,
    ])
    expect(rows[0]).toEqual({ attempts: 5, error_code: 'data_step_failed', lease_until: null })
    const claim = await db.query<{ p: unknown }>(`select public.claim_deletion_job($1, 120) p`, [seeded.ownerAId])
    expect(claim.rows[0].p).toBeNull()
  })

  it('lists due jobs oldest first and skips leased, finished and abandoned ones', async () => {
    await requestDeletion(seeded.ownerAId)
    await requestDeletion(seeded.ownerBId)
    await db.query(`update public.deletion_jobs set requested_at = now() - interval '1 hour' where user_id = $1`, [
      seeded.ownerBId,
    ])

    const both = await db.query<{ id: string }>(`select public.due_deletion_jobs(20) id`)
    expect(both.rows.map((row) => row.id)).toEqual([seeded.ownerBId, seeded.ownerAId])

    await db.query(`select public.claim_deletion_job($1, 120)`, [seeded.ownerBId])
    const leased = await db.query<{ id: string }>(`select public.due_deletion_jobs(20) id`)
    expect(leased.rows.map((row) => row.id)).toEqual([seeded.ownerAId])
  })

  it('is callable by the service role only', async () => {
    const { rows } = await db.query<{ proname: string; anon: boolean; authed: boolean; service: boolean }>(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'execute') anon,
              has_function_privilege('authenticated', p.oid, 'execute') authed,
              has_function_privilege('service_role', p.oid, 'execute') service
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('claim_deletion_job', 'mark_deletion_step', 'record_deletion_failure', 'due_deletion_jobs', 'delete_account_data')
       order by p.proname`,
    )
    expect(rows).toEqual([
      { proname: 'claim_deletion_job', anon: false, authed: false, service: true },
      { proname: 'delete_account_data', anon: false, authed: false, service: true },
      { proname: 'due_deletion_jobs', anon: false, authed: false, service: true },
      { proname: 'mark_deletion_step', anon: false, authed: false, service: true },
      { proname: 'record_deletion_failure', anon: false, authed: false, service: true },
    ])
  })
})
```

В `apps/web/tests/integration/schema.test.ts`, в `REQUIRED_FUNCTIONS`, добавить в алфавитном порядке
`'claim_deletion_job'`, `'delete_account_data'`, `'due_deletion_jobs'`, `'mark_deletion_step'`,
`'record_deletion_failure'`.

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
supabase start
npm run test:integration --workspace @lapka/web -- tests/integration/deletion-worker-sql.test.ts
```

Ожидание: FAIL, `function public.delete_account_data(unknown) does not exist` (и аналогично для
остальных функций).

- [ ] **Шаг 3: Написать миграцию**

Создать `supabase/migrations/20260917120000_deletion_worker.sql`:

```sql
-- Carrying out an accepted deletion request (stage 8/05).
--
-- Since 9 September a request marks the account `deleting` and records a job,
-- and then nothing happens: no code removes the data. These are the pieces the
-- worker in apps/web/src/server/account/deletion-worker.ts calls. The worker
-- owns the order of the steps; the database owns what each step does and who
-- may hold the job while it runs.
--
-- Revoking Apple tokens is not here: the owner deferred it on 17 September 2026.

alter table public.deletion_jobs
  add column if not exists attempts integer not null default 0;

alter table public.deletion_jobs
  add column if not exists lease_until timestamptz;

comment on column public.deletion_jobs.lease_until is
  'Until when a worker holds this job. Null or past means anyone may claim it.';

/**
 * Takes the job for one worker, or answers that somebody else has it.
 *
 * One statement, so the request's own `after()` and the daily cron arriving
 * together cannot both get the job: the second `update` finds the lease taken
 * and changes nothing. A job waiting on a person (`action_required`) and a
 * finished one are never claimed.
 *
 * Returns the job's progress, so the worker knows which steps already ran.
 */
create or replace function public.claim_deletion_job(p_user_id uuid, p_lease_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress jsonb;
begin
  update public.deletion_jobs
     set status = 'in_progress',
         lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where user_id = p_user_id
     and status in ('pending', 'in_progress')
     and (lease_until is null or lease_until <= now())
  returning progress into v_progress;

  return v_progress;
end;
$$;

/** Records that a step finished, so a retry does not run it again. */
create or replace function public.mark_deletion_step(p_user_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_step not in ('data', 'auth') then
    raise exception 'unknown deletion step %', p_step using errcode = 'invalid_parameter_value';
  end if;

  update public.deletion_jobs
     set progress = progress || jsonb_build_object(p_step, now()),
         updated_at = now()
   where user_id = p_user_id;
end;
$$;

/**
 * Counts a failed attempt and lets go of the job.
 *
 * Below the limit the job stays `in_progress` with no lease, so the next run —
 * the cron at the latest — picks it up. At the limit it becomes
 * `action_required`: a person has to look, and the status says so instead of
 * pretending the deletion finished.
 */
create or replace function public.record_deletion_failure(
  p_user_id uuid,
  p_error_code text,
  p_max_attempts integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  update public.deletion_jobs
     set attempts = attempts + 1,
         error_code = p_error_code,
         lease_until = null,
         status = case when attempts + 1 >= p_max_attempts then 'action_required' else 'in_progress' end,
         updated_at = now()
   where user_id = p_user_id
  returning status into v_status;

  return v_status;
end;
$$;

/** Jobs a scheduled run should try: unfinished, not held, oldest first. */
create or replace function public.due_deletion_jobs(p_limit integer)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select user_id
    from public.deletion_jobs
   where status in ('pending', 'in_progress')
     and (lease_until is null or lease_until <= now())
   order by requested_at
   limit p_limit;
$$;

/**
 * Removes everything the account owns in the database, in one transaction.
 *
 * The order follows docs/architecture/deletion-data-map.md, with two changes
 * found on 17 September 2026:
 *
 * - `check_jobs` go first. A spent check points at its ledger row with
 *   `ON DELETE SET NULL`; deleting the ledger would update those rows, and the
 *   late-write guard refuses any update for an account that is not `active`.
 * - The payment tables moved to `retired` on 10 September still hold the
 *   account: `retired.transactions` restricts deleting the Auth user and
 *   `retired.credit_transactions` blocks deleting the profile. Both are
 *   financial records, so they are archived like the ledger, not dropped.
 *
 * Safe to repeat: every insert into the archive ignores rows already there, and
 * every delete of rows already gone deletes nothing.
 */
create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'delete_account_data requires a user id';
  end if;

  delete from public.check_jobs where user_id = p_user_id;

  perform public.archive_account_financials(p_user_id);

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transaction_status_events', e.id, e.created_at, to_jsonb(e)
    from retired.transaction_status_events e
    join retired.transactions t on t.id = e.transaction_id
   where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select t.user_id, 'transactions', t.id, t.created_at, to_jsonb(t)
    from retired.transactions t
   where t.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  -- Status events go with their transaction by cascade.
  delete from retired.transactions where user_id = p_user_id;

  insert into public.financial_archive (subject_ref, source, source_id, occurred_at, record)
  select c.user_id, 'credit_transactions', c.id, c.created_at at time zone 'UTC', to_jsonb(c)
    from retired.credit_transactions c
   where c.user_id = p_user_id
  on conflict (source, source_id) do nothing;

  delete from retired.credit_transactions where user_id = p_user_id;

  delete from public.symptom_checks where user_id = p_user_id;
  delete from public.pets where user_id = p_user_id;
  -- user_feedback goes with the profile by cascade.
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.claim_deletion_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_deletion_job(uuid, integer) to service_role;

revoke all on function public.mark_deletion_step(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_deletion_step(uuid, text) to service_role;

revoke all on function public.record_deletion_failure(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.record_deletion_failure(uuid, text, integer) to service_role;

revoke all on function public.due_deletion_jobs(integer) from public, anon, authenticated;
grant execute on function public.due_deletion_jobs(integer) to service_role;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
```

Применить к локальной базе: `supabase migration up --local`. Если колонки `retired.*` или значение
перечисления `dummy` в тесте не совпадут с базой, свериться запросом к `information_schema.columns` и
поправить **тест**, а не схему.

- [ ] **Шаг 4: Убедиться, что тесты проходят**

```bash
npm run test:integration --workspace @lapka/web -- tests/integration/deletion-worker-sql.test.ts tests/integration/schema.test.ts tests/integration/account-deletion.test.ts
npm run test:integration --workspace @lapka/web
```

Ожидание: новые тесты PASS, `schema.test.ts` и прежние тесты удаления PASS. Если весь набор падает
только на `schema.test.ts` из-за функций `claim_check_job` и подобных, это мусор в локальной базе от
ветки `server/stage-6-job-reliability`: `supabase db reset --local` и повторить (локальная база
одноразовая).

- [ ] **Шаг 5: Коммит**

```bash
git add supabase/migrations/20260917120000_deletion_worker.sql apps/web/tests/integration/deletion-worker-sql.test.ts apps/web/tests/integration/schema.test.ts
git commit -F - <<'EOF'
Give the deletion job its database steps, retired payment tables included.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Задача 2. Обработчик: шаги, продолжение и отказ

**Файлы:**
- Создать: `apps/web/src/server/account/deletion-worker.ts`
- Тесты: `apps/web/tests/server/account/deletion-worker.test.ts`

**Интерфейсы:**
- Берёт: SQL-функции из задачи 1; `complete_deletion_job(p_user_id uuid, p_retain_for interval)` и
  `DELETION_RECORD_RETENTION_DAYS` из `@lapka/contracts` (уже есть).
- Отдаёт:
  - `type DeletionWorkerDeps = { claim(userId: string): Promise<Record<string, unknown> | null>; deleteAccountData(userId: string): Promise<void>; deleteAuthUser(userId: string): Promise<'deleted' | 'absent'>; markStep(userId: string, step: DeletionStep): Promise<void>; complete(userId: string): Promise<void>; recordFailure(userId: string, code: DeletionErrorCode): Promise<'in_progress' | 'action_required'>; log?(code: DeletionErrorCode): void }`
  - `type DeletionStep = 'data' | 'auth'`
  - `type DeletionErrorCode = 'data_step_failed' | 'auth_step_failed' | 'complete_step_failed'`
  - `type DeletionRunResult = 'completed' | 'retry' | 'action_required' | 'not_claimed'`
  - `processDeletionJob(deps: DeletionWorkerDeps, userId: string): Promise<DeletionRunResult>`
  - `createDeletionWorkerDeps(supabase: SupabaseService): DeletionWorkerDeps`
  - константы `DELETION_LEASE_SECONDS = 120`, `DELETION_MAX_ATTEMPTS = 5`

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/server/account/deletion-worker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { processDeletionJob, type DeletionWorkerDeps } from '@/server/account/deletion-worker'

const USER = '11111111-1111-4111-8111-000000000abc'

function deps(overrides: Partial<DeletionWorkerDeps> = {}): DeletionWorkerDeps {
  return {
    claim: vi.fn(async () => ({})),
    deleteAccountData: vi.fn(async () => {}),
    deleteAuthUser: vi.fn(async () => 'deleted' as const),
    markStep: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => 'in_progress' as const),
    log: vi.fn(),
    ...overrides,
  }
}

describe('processing a deletion job', () => {
  it('runs data, then Auth, then completes, marking each step', async () => {
    const d = deps()
    const order: string[] = []
    d.deleteAccountData = vi.fn(async () => void order.push('data'))
    d.deleteAuthUser = vi.fn(async () => (order.push('auth'), 'deleted' as const))
    d.markStep = vi.fn(async (_user, step) => void order.push(`mark:${step}`))
    d.complete = vi.fn(async () => void order.push('complete'))

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(order).toEqual(['data', 'mark:data', 'auth', 'mark:auth', 'complete'])
  })

  it('does nothing when the job cannot be claimed', async () => {
    const d = deps({ claim: vi.fn(async () => null) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('not_claimed')
    expect(d.deleteAccountData).not.toHaveBeenCalled()
    expect(d.recordFailure).not.toHaveBeenCalled()
  })

  it('resumes after the data step without running it again', async () => {
    const d = deps({ claim: vi.fn(async () => ({ data: '2026-09-17T10:00:00Z' })) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(d.deleteAccountData).not.toHaveBeenCalled()
    expect(d.deleteAuthUser).toHaveBeenCalledWith(USER)
  })

  it('only completes when both steps are already done', async () => {
    const d = deps({ claim: vi.fn(async () => ({ data: 'x', auth: 'y' })) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(d.deleteAccountData).not.toHaveBeenCalled()
    expect(d.deleteAuthUser).not.toHaveBeenCalled()
    expect(d.complete).toHaveBeenCalledWith(USER)
  })

  it('treats an Auth user that is already gone as done', async () => {
    const d = deps({ deleteAuthUser: vi.fn(async () => 'absent' as const) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('completed')
    expect(d.markStep).toHaveBeenCalledWith(USER, 'auth')
  })

  it.each([
    ['deleteAccountData', 'data_step_failed'],
    ['deleteAuthUser', 'auth_step_failed'],
    ['complete', 'complete_step_failed'],
  ] as const)('records a failure of %s as %s and stops there', async (step, code) => {
    const d = deps({ [step]: vi.fn(async () => { throw new Error('user 42 secret detail') }) })

    await expect(processDeletionJob(d, USER)).resolves.toBe('retry')
    expect(d.recordFailure).toHaveBeenCalledWith(USER, code)
    expect(d.log).toHaveBeenCalledWith(code)
    if (step === 'deleteAccountData') expect(d.deleteAuthUser).not.toHaveBeenCalled()
    if (step !== 'complete') expect(d.complete).not.toHaveBeenCalled()
  })

  it('reports that a person is needed once the attempts run out', async () => {
    const d = deps({
      deleteAuthUser: vi.fn(async () => { throw new Error('down') }),
      recordFailure: vi.fn(async () => 'action_required' as const),
    })

    await expect(processDeletionJob(d, USER)).resolves.toBe('action_required')
  })

  it('never marks a step that failed', async () => {
    const d = deps({ deleteAccountData: vi.fn(async () => { throw new Error('boom') }) })

    await processDeletionJob(d, USER)

    expect(d.markStep).not.toHaveBeenCalled()
  })

  it('never logs the user id or the error text', async () => {
    const log = vi.fn()
    const d = deps({ log, deleteAuthUser: vi.fn(async () => { throw new Error(`no user ${USER}`) }) })

    await processDeletionJob(d, USER)

    for (const call of log.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(USER)
      expect(JSON.stringify(call)).not.toContain('no user')
    }
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

`npm run test --workspace @lapka/web -- tests/server/account/deletion-worker.test.ts`
Ожидание: FAIL, `Failed to resolve import "@/server/account/deletion-worker"`.

- [ ] **Шаг 3: Написать модуль**

Создать `apps/web/src/server/account/deletion-worker.ts`:

```ts
import 'server-only'

import { DELETION_RECORD_RETENTION_DAYS } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Carrying out an accepted deletion request (stage 8/05).
 *
 * The request only marks the account and records a job. This takes the job and
 * walks it to the end: the account's rows (one transaction, see
 * `delete_account_data`), then the Auth user, then the job is marked complete.
 * Each finished step is written into the job, so a run that dies halfway is
 * picked up by the next one — the request's own `after()` or the daily cron —
 * without repeating what already happened.
 *
 * A failure is counted, never thrown and never reported as success. After
 * `DELETION_MAX_ATTEMPTS` the job waits for a person, and the receipt says
 * `action_required`.
 *
 * Revoking Apple tokens is deliberately absent: deferred by the owner on
 * 17 September 2026.
 */

export const DELETION_LEASE_SECONDS = 120
export const DELETION_MAX_ATTEMPTS = 5

export type DeletionStep = 'data' | 'auth'
export type DeletionErrorCode = 'data_step_failed' | 'auth_step_failed' | 'complete_step_failed'
export type DeletionRunResult = 'completed' | 'retry' | 'action_required' | 'not_claimed'

export type DeletionWorkerDeps = {
  /** Takes the job; returns its progress, or null when someone else holds it or it is not due. */
  claim(userId: string): Promise<Record<string, unknown> | null>
  deleteAccountData(userId: string): Promise<void>
  /** `absent` when the Auth user is already gone — a finished step, not an error. */
  deleteAuthUser(userId: string): Promise<'deleted' | 'absent'>
  markStep(userId: string, step: DeletionStep): Promise<void>
  complete(userId: string): Promise<void>
  recordFailure(userId: string, code: DeletionErrorCode): Promise<'in_progress' | 'action_required'>
  /** Only the code. The user id and the underlying error stay out of logs. */
  log?(code: DeletionErrorCode): void
}

export async function processDeletionJob(
  deps: DeletionWorkerDeps,
  userId: string,
): Promise<DeletionRunResult> {
  const progress = await deps.claim(userId)
  if (progress === null) return 'not_claimed'

  let code: DeletionErrorCode = 'data_step_failed'
  try {
    if (!('data' in progress)) {
      await deps.deleteAccountData(userId)
      await deps.markStep(userId, 'data')
    }

    code = 'auth_step_failed'
    if (!('auth' in progress)) {
      await deps.deleteAuthUser(userId)
      await deps.markStep(userId, 'auth')
    }

    code = 'complete_step_failed'
    await deps.complete(userId)
    return 'completed'
  } catch {
    deps.log?.(code)
    const status = await deps.recordFailure(userId, code)
    return status === 'action_required' ? 'action_required' : 'retry'
  }
}

/** The worker's dependencies over the real database and Auth admin API. */
export function createDeletionWorkerDeps(supabase: SupabaseService): DeletionWorkerDeps {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(name, args)
    if (error) throw new Error(`${name} failed`)
    return data as T
  }

  return {
    claim: (userId) =>
      rpc<Record<string, unknown> | null>('claim_deletion_job', {
        p_user_id: userId,
        p_lease_seconds: DELETION_LEASE_SECONDS,
      }),
    deleteAccountData: (userId) => rpc<void>('delete_account_data', { p_user_id: userId }),
    async deleteAuthUser(userId) {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      if (!error) return 'deleted'
      if (error.status === 404) return 'absent'
      throw new Error('auth delete failed')
    },
    markStep: (userId, step) => rpc<void>('mark_deletion_step', { p_user_id: userId, p_step: step }),
    async complete(userId) {
      const done = await rpc<boolean>('complete_deletion_job', {
        p_user_id: userId,
        p_retain_for: `${DELETION_RECORD_RETENTION_DAYS} days`,
      })
      if (done !== true) throw new Error('complete failed')
    },
    recordFailure: (userId, code) =>
      rpc<'in_progress' | 'action_required'>('record_deletion_failure', {
        p_user_id: userId,
        p_error_code: code,
        p_max_attempts: DELETION_MAX_ATTEMPTS,
      }),
    log: (code) => console.error(`[account-deletion] ${code}`),
  }
}
```

- [ ] **Шаг 4: Убедиться, что тесты проходят**

```bash
npm run test --workspace @lapka/web -- tests/server/account/deletion-worker.test.ts
npm run typecheck --workspace @lapka/web
npm run lint --workspace @lapka/web
```

Ожидание: 11 тестов PASS (три из `it.each`), типы и линтер чистые.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web/src/server/account/deletion-worker.ts apps/web/tests/server/account/deletion-worker.test.ts
git commit -F - <<'EOF'
Walk a deletion job through its steps, and resume where a failed run stopped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Задача 3. Запуск сразу после заявки и проверка на настоящей базе

**Файлы:**
- Создать: `apps/web/src/server/account/deletion-after.ts`
- Изменить: `apps/web/tests/server/architecture/service-boundaries.test.ts` (список `ADAPTERS`)
- Изменить: `apps/web/src/app/(backend)/api/v1/account-deletion/route.ts`
- Изменить: `apps/web/src/app/(backend)/api/account-deletion/route.ts`
- Изменить: `apps/web/tests/integration/deletion-web-adapter.test.ts` (подмена планировщика)
- Тесты: `apps/web/tests/integration/deletion-worker.test.ts`

**Интерфейсы:**
- Берёт: `processDeletionJob`, `createDeletionWorkerDeps`, `DeletionWorkerDeps` (задача 2).
- Отдаёт: `scheduleDeletionProcessing(userId: string): void`.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/integration/deletion-worker.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { createServiceClient } from '@/server/supabase/server'
import {
  createDeletionWorkerDeps,
  processDeletionJob,
  type DeletionWorkerDeps,
} from '@/server/account/deletion-worker'
import { readDeletionStatus } from '@/server/account/deletion-status'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 8/05 end to end: the real worker against the real database and Auth.
 * Faults are injected by wrapping one real dependency, so every other step is
 * the code that runs in production.
 */

let db: Client
let seeded: SeededFixtures
const RECEIPT = 'a'.repeat(64)

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  // The fixture reset truncates the business tables but not these: jobs and
  // archive rows have no foreign key to the users it removes.
  await db.query('delete from public.deletion_jobs')
  await db.query('delete from public.financial_archive')
})

afterAll(async () => {
  await db.end()
})

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql, params)
  return Number(rows[0].n)
}

async function requestDeletion(userId: string, receipt = RECEIPT): Promise<void> {
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256').update(receipt, 'utf8').digest('hex')
  await db.query(`select public.request_account_deletion($1, $2)`, [userId, hash])
}

function realDeps(): DeletionWorkerDeps {
  return { ...createDeletionWorkerDeps(createServiceClient()), log: () => {} }
}

async function job(userId: string) {
  const { rows } = await db.query(
    `select status, attempts, progress, retain_until is not null retained from public.deletion_jobs where user_id = $1`,
    [userId],
  )
  return rows[0]
}

describe('the deletion worker against the real database', () => {
  it('deletes the account and completes the job', async () => {
    await requestDeletion(seeded.ownerAId)

    await expect(processDeletionJob(realDeps(), seeded.ownerAId)).resolves.toBe('completed')

    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(0)
    expect(await count(`select count(*) n from public.profiles where id = $1`, [seeded.ownerAId])).toBe(0)
    expect(await job(seeded.ownerAId)).toMatchObject({ status: 'completed', retained: true })
    const status = await readDeletionStatus(createServiceClient(), RECEIPT)
    expect(status).toMatchObject({ found: true, status: 'completed' })
  })

  it('leaves the other owner signed in and whole', async () => {
    await requestDeletion(seeded.ownerAId)

    await processDeletionJob(realDeps(), seeded.ownerAId)

    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerBId])).toBe(1)
    expect(await count(`select count(*) n from public.pets where user_id = $1`, [seeded.ownerBId])).toBe(2)
  })

  it('resumes after the Auth step failed, without touching the data again', async () => {
    await requestDeletion(seeded.ownerAId)
    const failing = { ...realDeps(), deleteAuthUser: async () => { throw new Error('auth down') } }

    await expect(processDeletionJob(failing, seeded.ownerAId)).resolves.toBe('retry')
    expect(await job(seeded.ownerAId)).toMatchObject({ status: 'in_progress', attempts: 1 })
    expect(Object.keys((await job(seeded.ownerAId)).progress)).toEqual(['data'])
    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(1)

    let dataRanAgain = false
    const resumed = { ...realDeps(), deleteAccountData: async () => void (dataRanAgain = true) }
    await expect(processDeletionJob(resumed, seeded.ownerAId)).resolves.toBe('completed')
    expect(dataRanAgain).toBe(false)
    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(0)
  })

  it('leaves nothing half-deleted when the data step fails', async () => {
    await requestDeletion(seeded.ownerAId)
    const deps = realDeps()
    const failing = {
      ...deps,
      deleteAccountData: async (userId: string) => {
        await deps.deleteAccountData(userId)
        throw new Error('connection dropped after commit')
      },
    }

    await expect(processDeletionJob(failing, seeded.ownerAId)).resolves.toBe('retry')
    await expect(processDeletionJob(realDeps(), seeded.ownerAId)).resolves.toBe('completed')
    expect(await count(`select count(*) n from public.financial_archive where subject_ref = $1`, [seeded.ownerAId])).toBe(4)
  })

  it('lets only one of two simultaneous runs do the work', async () => {
    await requestDeletion(seeded.ownerAId)

    const results = await Promise.all([
      processDeletionJob(realDeps(), seeded.ownerAId),
      processDeletionJob(realDeps(), seeded.ownerAId),
    ])

    expect([...results].sort()).toEqual(['completed', 'not_claimed'])
  })

  it('stops at action_required after five failures and says so to the receipt', async () => {
    await requestDeletion(seeded.ownerAId)
    const failing = { ...realDeps(), deleteAuthUser: async () => { throw new Error('down') } }

    const results = []
    for (let attempt = 0; attempt < 5; attempt++) results.push(await processDeletionJob(failing, seeded.ownerAId))

    expect(results).toEqual(['retry', 'retry', 'retry', 'retry', 'action_required'])
    const status = await readDeletionStatus(createServiceClient(), RECEIPT)
    expect(status).toMatchObject({ found: true, status: 'action_required' })
    await expect(processDeletionJob(realDeps(), seeded.ownerAId)).resolves.toBe('not_claimed')
  })
})
```

Если `readDeletionStatus` принимает другие аргументы, свериться с
`apps/web/src/server/account/deletion-status.ts` и `tests/integration/deletion-status.test.ts` и
поправить вызов в тесте; смысл проверки не меняется.

- [ ] **Шаг 2: Убедиться, что тесты проходят или падают по делу**

`npm run test:integration --workspace @lapka/web -- tests/integration/deletion-worker.test.ts`
Ожидание: PASS — задачи 1 и 2 уже дают всё нужное. Если что-то падает, это дефект задач 1–2:
остановиться и сообщить (`DONE_WITH_CONCERNS`), не подгоняя тест.

- [ ] **Шаг 3: Адаптер `after()`**

Создать `apps/web/src/server/account/deletion-after.ts`:

```ts
import 'server-only'

import { after } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { createDeletionWorkerDeps, processDeletionJob } from '@/server/account/deletion-worker'

/**
 * Starts the deletion right after the `202` is sent.
 *
 * The person is told the request was accepted before any of the work begins;
 * the work itself usually finishes seconds later. If the platform stops the
 * function first, the job keeps its progress and the daily cron finishes it —
 * the receipt says `pending` meanwhile, never `completed` early.
 */
export function scheduleDeletionProcessing(userId: string): void {
  after(async () => {
    await processDeletionJob(createDeletionWorkerDeps(createServiceClient()), userId)
  })
}
```

В `apps/web/tests/server/architecture/service-boundaries.test.ts` добавить в `ADAPTERS` строку
`'account/deletion-after.ts',` (по алфавиту — перед `'api/bearer-auth.ts'`).

- [ ] **Шаг 4: Маршруты**

В `apps/web/src/app/(backend)/api/v1/account-deletion/route.ts`:
- добавить импорт `import { scheduleDeletionProcessing } from '@/server/account/deletion-after'`;
- сразу перед `const response = apiSuccess(` вставить `scheduleDeletionProcessing(context.account.userId)`;
- в шапке файла заменить абзац «Answers only that the request was accepted…» так, чтобы он
  упоминал запуск: `Answers only that the request was accepted, and starts the cleanup after the answer is sent (stage 8/05).`
  Остальные абзацы не трогать.

В `apps/web/src/app/(backend)/api/account-deletion/route.ts`:
- добавить тот же импорт;
- сразу перед `const response = NextResponse.json({ status: 'accepted' }, { status: 202 })`
  вставить `scheduleDeletionProcessing(user.id)`.

В `apps/web/tests/integration/deletion-web-adapter.test.ts` сразу после импортов добавить:

```ts
const scheduled = vi.hoisted(() => [] as string[])
vi.mock('@/server/account/deletion-after', () => ({
  scheduleDeletionProcessing: (userId: string) => void scheduled.push(userId),
}))
```

и в тот тест файла, где веб-заявка принимается с `202`, в конце добавить
`expect(scheduled.filter((id) => id === seeded.ownerAId)).toHaveLength(1)`; в тест, где заявка
через `/api/v1` принимается с `202`, — то же для того пользователя, от чьего имени он идёт. В тестах,
где заявка отклоняется (`401`, `403`, без CSRF), добавить проверку, что для этого пользователя
ничего не запланировано. Перед каждым тестом очищать `scheduled.length = 0` (в существующем
`beforeEach`, или добавить его).

- [ ] **Шаг 5: Проверки**

```bash
npm run test --workspace @lapka/web
npm run test:integration --workspace @lapka/web
npm run typecheck --workspace @lapka/web
npm run lint --workspace @lapka/web
```

Ожидание: всё PASS, включая `service-boundaries.test.ts` и `deletion-web-adapter.test.ts`. Если
какой-то другой тест вызывает эти маршруты напрямую и падает с ``\`after\` was called outside a
request scope``, подменить в нём `@/server/account/deletion-after` тем же `vi.mock`.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web/src/server/account/deletion-after.ts apps/web/tests/server/architecture/service-boundaries.test.ts "apps/web/src/app/(backend)/api/v1/account-deletion/route.ts" "apps/web/src/app/(backend)/api/account-deletion/route.ts" apps/web/tests/integration/deletion-web-adapter.test.ts apps/web/tests/integration/deletion-worker.test.ts
git commit -F - <<'EOF'
Start the deletion as soon as the request is answered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Задача 4. Ежедневный крон

**Файлы:**
- Создать: `apps/web/src/server/account/deletion-cron.ts`
- Создать: `apps/web/src/app/(backend)/api/cron/deletion-jobs/route.ts`
- Изменить: `vercel.json`
- Тесты: `apps/web/tests/server/account/deletion-cron.test.ts`, `apps/web/tests/integration/deletion-cron.test.ts`

**Интерфейсы:**
- Берёт: `processDeletionJob`, `createDeletionWorkerDeps`, `DeletionRunResult` (задача 2).
- Отдаёт:
  - `isCronAuthorized(header: string | null, secret: string | undefined): boolean`
  - `runDeletionCron(supabase: SupabaseService, process?: (userId: string) => Promise<DeletionRunResult>): Promise<{ processed: number; completed: number; retried: number; actionRequired: number; purged: number }>`
  - константа `DELETION_CRON_BATCH = 20`

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/server/account/deletion-cron.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isCronAuthorized } from '@/server/account/deletion-cron'

describe('who may run the deletion cron', () => {
  it('accepts exactly the configured secret as a bearer token', () => {
    expect(isCronAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true)
  })

  it.each([
    [null, 's3cret-value'],
    ['', 's3cret-value'],
    ['s3cret-value', 's3cret-value'],
    ['Bearer wrong', 's3cret-value'],
    ['Bearer s3cret-valu', 's3cret-value'],
    ['Bearer s3cret-value', undefined],
    ['Bearer ', ''],
  ])('refuses %j when the secret is %j', (header, secret) => {
    expect(isCronAuthorized(header, secret)).toBe(false)
  })
})
```

Создать `apps/web/tests/integration/deletion-cron.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import type { Client } from 'pg'
import { GET as cronRoute } from '@/app/(backend)/api/cron/deletion-jobs/route'
import { createServiceClient } from '@/server/supabase/server'
import { runDeletionCron } from '@/server/account/deletion-cron'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

let db: Client
let seeded: SeededFixtures

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  // The fixture reset does not truncate job or archive rows; see deletion-worker.test.ts.
  await db.query('delete from public.deletion_jobs')
  await db.query('delete from public.financial_archive')
  process.env.CRON_SECRET = 'integration-cron-secret'
})

afterAll(async () => {
  delete process.env.CRON_SECRET
  await db.end()
})

async function requestDeletion(userId: string): Promise<void> {
  await db.query(`select public.request_account_deletion($1, $2)`, [userId, `hash-${userId}`])
}

function get(authorization?: string) {
  return new NextRequest('http://test.local/api/cron/deletion-jobs', {
    headers: authorization ? { authorization } : {},
  })
}

describe('the deletion cron', () => {
  it('refuses a call without the secret and does nothing', async () => {
    await requestDeletion(seeded.ownerAId)

    expect((await cronRoute(get())).status).toBe(401)
    expect((await cronRoute(get('Bearer nope'))).status).toBe(401)
    const { rows } = await db.query(`select status from public.deletion_jobs where user_id = $1`, [seeded.ownerAId])
    expect(rows[0].status).toBe('pending')
  })

  it('finishes waiting jobs and reports counts without ids', async () => {
    await requestDeletion(seeded.ownerAId)
    await requestDeletion(seeded.ownerBId)

    const response = await cronRoute(get('Bearer integration-cron-secret'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ processed: 2, completed: 2, retried: 0, actionRequired: 0 })
    expect(JSON.stringify(body)).not.toContain(seeded.ownerAId)
    const { rows } = await db.query(`select count(*)::int n from auth.users where id = any($1)`, [
      [seeded.ownerAId, seeded.ownerBId],
    ])
    expect(rows[0].n).toBe(0)
  })

  it('removes finished job records whose retention ran out', async () => {
    await requestDeletion(seeded.ownerAId)
    await db.query(
      `update public.deletion_jobs set status = 'completed', completed_at = now(), retain_until = now() - interval '1 day' where user_id = $1`,
      [seeded.ownerAId],
    )

    const summary = await runDeletionCron(createServiceClient(), async () => 'completed')

    expect(summary.purged).toBe(1)
    const { rows } = await db.query(`select count(*)::int n from public.deletion_jobs where user_id = $1`, [seeded.ownerAId])
    expect(rows[0].n).toBe(0)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
npm run test --workspace @lapka/web -- tests/server/account/deletion-cron.test.ts
npm run test:integration --workspace @lapka/web -- tests/integration/deletion-cron.test.ts
```

Ожидание: FAIL на импорте `@/server/account/deletion-cron` и маршрута.

- [ ] **Шаг 3: Реализовать**

Создать `apps/web/src/server/account/deletion-cron.ts`:

```ts
import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import type { createServiceClient } from '@/server/supabase/server'
import {
  createDeletionWorkerDeps,
  processDeletionJob,
  type DeletionRunResult,
} from '@/server/account/deletion-worker'

type SupabaseService = ReturnType<typeof createServiceClient>

/** How many jobs one daily run takes on. The rest wait for tomorrow. */
export const DELETION_CRON_BATCH = 20

/**
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` to scheduled routes.
 * Without a configured secret nothing is authorized: an unset variable must
 * not turn the route into a public "delete everything waiting" button.
 */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8')
  const actual = Buffer.from(header, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * The daily safety net for stage 8/05: finishes jobs the request's own run did
 * not, and removes finished job records whose retention has run out.
 */
export async function runDeletionCron(
  supabase: SupabaseService,
  process: (userId: string) => Promise<DeletionRunResult> = (userId) =>
    processDeletionJob(createDeletionWorkerDeps(supabase), userId),
) {
  const { data: due, error } = await supabase.rpc('due_deletion_jobs', { p_limit: DELETION_CRON_BATCH })
  if (error) throw new Error('due_deletion_jobs failed')

  const summary = { processed: 0, completed: 0, retried: 0, actionRequired: 0, purged: 0 }
  for (const userId of (due ?? []) as string[]) {
    const result = await process(userId)
    summary.processed++
    if (result === 'completed') summary.completed++
    if (result === 'retry') summary.retried++
    if (result === 'action_required') summary.actionRequired++
  }

  const { data: purged, error: purgeError } = await supabase.rpc('purge_expired_deletion_jobs')
  if (purgeError) throw new Error('purge_expired_deletion_jobs failed')
  summary.purged = Number(purged ?? 0)

  return summary
}
```

Создать `apps/web/src/app/(backend)/api/cron/deletion-jobs/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { isCronAuthorized, runDeletionCron } from '@/server/account/deletion-cron'

/**
 * Daily run of the account deletion worker (stage 8/05), called by Vercel Cron
 * as configured in vercel.json. Answers counts only — no ids, no addresses.
 */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runDeletionCron(createServiceClient())
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[account-deletion] cron run failed')
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 })
  }
}
```

В `vercel.json` добавить после `"outputDirectory"`:

```json
  "crons": [
    { "path": "/api/cron/deletion-jobs", "schedule": "0 3 * * *" }
  ]
```

(не забыть запятую после строки `outputDirectory`). Проверка: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`.

Если в проекте есть `proxy.ts`/middleware, который требует сессию или CSRF для всех `/api/*`,
убедиться, что `/api/cron/deletion-jobs` через него проходит без сессии: `grep -rn "matcher\|/api" apps/web/src/proxy.ts`.
Если не проходит — добавить путь в исключения рядом с уже существующими и отметить это в отчёте.

- [ ] **Шаг 4: Убедиться, что тесты проходят**

```bash
npm run test --workspace @lapka/web
npm run test:integration --workspace @lapka/web
npm run typecheck --workspace @lapka/web
npm run lint --workspace @lapka/web
npm run build --workspace @lapka/web
```

Ожидание: всё PASS; в выводе сборки есть маршрут `/api/cron/deletion-jobs`.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web/src/server/account/deletion-cron.ts "apps/web/src/app/(backend)/api/cron/deletion-jobs/route.ts" vercel.json apps/web/tests/server/account/deletion-cron.test.ts apps/web/tests/integration/deletion-cron.test.ts
git commit -F - <<'EOF'
Finish unfinished deletions once a day, behind the cron secret.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Задача 5. Документы

**Файлы:**
- Изменить: `docs/architecture/deletion-data-map.md`
- Изменить: `docs/architecture/jobs-uploads-deletion.md` (раздел 4)
- Изменить: `docs/architecture/deployment.md`
- Изменить: `docs/verification/OPEN_QUESTIONS.md`
- Изменить: `docs/superpowers/specs/2026-09-17-stage-8-05-deletion-worker-design.md`

- [ ] **Шаг 1: Карта данных**

В `docs/architecture/deletion-data-map.md`, в разделе 1, после абзаца с «Отсюда единственный
допустимый порядок в `public`:» и его строки порядка добавить:

```markdown
**Уточнение 17 сентября 2026 (8/05).** Таблицы оплат переехали в схему `retired` 10 сентября, но
держат аккаунт по-прежнему: `retired.transactions.user_id → auth.users` — **RESTRICT**,
`retired.credit_transactions.user_id → profiles` — **NO ACTION**. А `check_jobs.usage_ledger_id →
credit_ledger` — **SET NULL**: удаление записей баланса обновляет задачи анализа, а обновление для
аккаунта не в статусе `active` запрещено защитой от поздних записей. Порядок, который выполняет
`delete_account_data`:

`check_jobs` → `extra_check_requests` → `credit_ledger` (в архив) → `retired.transaction_status_events`
и `retired.transactions` (в архив) → `retired.credit_transactions` (в архив) → `symptom_checks` →
`pets` → `profiles` (`user_feedback` каскадом) → `auth.users` отдельным шагом обработчика.
```

- [ ] **Шаг 2: Модель задач**

В `docs/architecture/jobs-uploads-deletion.md`, раздел 4, после списка «Порядок шагов» добавить:

```markdown
**Реализовано 17 сентября 2026 (8/05)** — `apps/web/src/server/account/deletion-worker.ts`. Шаги 2
и 4 беспредметны (задач анализа в очереди и файлов Storage у пользователей пока нет), шаг 3 отложен
владельцем. Шаги 5 и 6 — `delete_account_data` одной транзакцией и удаление пользователя Auth;
каждый отмечается в `progress`. Запуск — `after()` после ответа на заявку и крон Vercel
`/api/cron/deletion-jobs` раз в сутки в 03:00 UTC. Аренда задачи 120 секунд, после 5 неудачных
попыток — `action_required`.
```

- [ ] **Шаг 3: Развёртывание**

В `docs/architecture/deployment.md`, в таблицу переменных окружения Vercel, добавить строку в
формате соседних:

```markdown
| `CRON_SECRET` | Production | Sensitive |
```

и под таблицей абзац:

```markdown
**`CRON_SECRET`** (с 17 сентября 2026) — Vercel передаёт его маршрутам крона в заголовке
`Authorization: Bearer …`. Без него `/api/cron/deletion-jobs` отвечает `401` и ежедневная
подстраховка удаления аккаунтов не работает; заявки при этом обрабатываются сразу после приёма.
Значение — не короче 32 случайных байт.
```

- [ ] **Шаг 4: Открытые вопросы**

В `docs/verification/OPEN_QUESTIONS.md`, в конец таблицы раздела 2 (после строки `2.14`),
добавить две строки:

```markdown
| 2.15 | **Отзыв Apple-токенов при удалении аккаунта** | 5/06, 5/07, 8/05 | Отложен решением владельца 17 сентября 2026: Apple *рекомендует* (should) отзывать токены через REST API, но не требует, а реализация требовала отдельного окна Apple на странице удаления, ключей Apple в Vercel и хранения токена в зашифрованном виде. Следствие: после удаления аккаунта Лапка остаётся в списке «Вход с Apple» в настройках Apple ID человека, пока он не уберёт её сам. Вернуться, если App Review спросит |
| 2.16 | **На production применена миграция из незаконченной ветки** | 6, 0/06 | `20260910090000_check_job_queue` из `server/stage-6-job-reliability` (коммит `e0ebc86`, «WIP, not for merge») есть в `supabase_migrations.schema_migrations` production, но не в `main` и не на staging. Схема production расходится с репозиторием на функции очереди задач анализа. Обнаружено 17 сентября 2026 при проектировании 8/05; нужно решение: откатить на production или довести ветку |
```

- [ ] **Шаг 5: Спека**

В `docs/superpowers/specs/2026-09-17-stage-8-05-deletion-worker-design.md`, в разделе «Найдено при
проектировании», после абзаца про `archive_account_financials` добавить:

```markdown
Ещё одна ловушка, найденная при написании плана: `check_jobs.usage_ledger_id → credit_ledger` —
`ON DELETE SET NULL`. Удаление записей баланса обновляет задачи анализа, а защита от поздних
записей (`refuse_late_writes`) запрещает любое обновление для аккаунта не в статусе `active`.
Поэтому `delete_account_data` удаляет `check_jobs` первыми.
```

- [ ] **Шаг 6: Коммит**

```bash
git add docs/architecture/deletion-data-map.md docs/architecture/jobs-uploads-deletion.md docs/architecture/deployment.md docs/verification/OPEN_QUESTIONS.md docs/superpowers/specs/2026-09-17-stage-8-05-deletion-worker-design.md
git commit -F - <<'EOF'
Write down the deletion order that actually works, and what stays open.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Задача 6. Развёртывание и приёмка (контроллер вместе с владельцем)

Не для субагента: нужны согласие владельца на запись в облачные базы и доступ к Vercel.

- [ ] **Шаг 1: Миграция на staging** — с согласия владельца: `supabase db push` для проекта
  `rclnsbivyulqmvujiopv`; проверка: `supabase migration list` показывает `20260917120000` и на
  local, и на remote.
- [ ] **Шаг 2: Миграция на production** — с согласия владельца, для проекта `bczseshsgpzulqynvukg`;
  проверка запросом к `supabase_migrations.schema_migrations`. **До мерджа кода** (урок 0.3).
- [ ] **Шаг 3: `CRON_SECRET`** — сгенерировать `openssl rand -hex 32`, владелец вписывает в Vercel,
  Production, Sensitive.
- [ ] **Шаг 4: PR, CI, мердж, выкатка.**
- [ ] **Шаг 5: Ручная проверка на staging** — тестовый аккаунт с питомцем и проверкой, заявка на
  удаление из приложения или с сайта против staging; через минуту статус по квитанции `completed`;
  в staging-базе нет строк пользователя, в `financial_archive` есть его записи баланса.
- [ ] **Шаг 6: Крон на production** — в Vercel → Settings → Cron Jobs виден `/api/cron/deletion-jobs`;
  ручной запуск оттуда отвечает `200` со счётчиками.
- [ ] **Шаг 7: Отчёт** — раздел «Дополнение 17 сентября» в `docs/verification/stage-8.md` с матрицей
  8/05, запись прогона в `docs/verification/runs/stage-8/`, отметка 8/05 в `docs/mobile-api-plan.md`.

## Порядок

Задачи 1 → 2 → 3 → 4 последовательно. Задача 5 после 4. Задача 6 последней.
