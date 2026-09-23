# Исполнимый план 6/01–6/03 — фотографии через приватное хранилище

> **Для агентов:** реализовывать по одной задаче через `superpowers:subagent-driven-development`
> либо `superpowers:executing-plans`. Шаги отмечаются чекбоксами.

**Цель:** к проверке симптомов можно приложить до трёх фотографий. Файлы идут с телефона прямо в
приватный bucket Supabase Storage, минуя Vercel и его лимит тела в 4.5 МБ. Сервер получает только
`upload_id`, сам скачивает и проверяет байты, отдаёт их в анализ и сразу удаляет.

**Подход:** `POST /api/v1/uploads` записывает строку в `photo_uploads` и выдаёт на каждый файл
подписанную ссылку на загрузку (signed upload URL) в bucket `check-photos`. Телефон сжимает фото
в JPEG и отправляет его `PUT`-ом по этой ссылке. `POST /api/v1/checks` с `upload_ids` атомарно
привязывает загрузки к проверке, скачивает объекты, сверяет фактический формат и разрешение, и
только потом резервирует кредит и вызывает AI. После анализа, успешного или нет, объекты и строки
удаляются. Брошенные загрузки удаляет ночной крон. Если аккаунт удаляется, обработчик удаления
сначала стирает фото пользователя, потом всё остальное.

**Стек:** Next.js 16.3 (Route Handlers), Supabase Storage и `@supabase/supabase-js` 2.103,
`image-size` 2.x (читает только заголовок файла, нативных зависимостей нет), vitest 4. На
телефоне Expo SDK 57: `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`, `expo/fetch`.

**Спека:** требования и приёмка — [docs/photos-next-version.md](../../photos-next-version.md)
(пункты 6/01–6/03). Правила — [docs/architecture/jobs-uploads-deletion.md §3](../../architecture/jobs-uploads-deletion.md).
Значения, которые там помечены **БЛОКЕР**, решены ниже, в разделе «Решения». Отдельного файла
спеки нет: владелец попросил начать сразу с плана, 23 сентября 2026.

## Решения, которые этот план фиксирует

| Вопрос | Решение | Почему |
| --- | --- | --- |
| Сколько фото | До **3** в одной проверке | Решение владельца 23 сентября 2026. В контракте было 5, в макете §6.20 тоже 5: исправляются оба |
| Типы | Только `image/jpeg`, `image/png`, `image/webp` | Эти форматы принимает OpenAI. HEIC телефон сам переводит в JPEG, серверу декодировать HEIC нечем |
| Размер файла | ≤ **5 МБ** (5 242 880 байт) | Ограничение задаётся самим bucket (`file_size_limit`) и дублируется в контракте. После сжатия на телефоне файл весит ~0.3–0.6 МБ |
| Разрешение | Каждая сторона ≤ **4096 px** | OpenAI всё равно ужимает до 2048. Защищает от «бомбы» в заголовке. Телефон отдаёт длинную сторону 1600 px |
| Срок подписанной ссылки в Storage | **2 часа**, изменить нельзя | `createSignedUploadUrl` в storage-js 2.103 не принимает срок, он зашит на сервере Storage |
| Срок, в который загрузку можно приложить к проверке (`expires_at`) | **15 минут** | Наш собственный срок. После него `upload_id` отклоняется, даже если ссылка Storage ещё жива |
| Когда подметается брошенная загрузка | Ночной крон удаляет всё старше **3 часов** (2 ч ссылки + запас) | Vercel Hobby разрешает кроны только раз в сутки, так что в худшем случае брошенный файл проживёт около суток. Приложенные к проверке файлы удаляются сразу после анализа |
| Перезапись объекта | Запрещена | Подписанная ссылка выдаётся с `upsert: false`. На `storage.objects` нет политик для `anon` и `authenticated`, а сервер анализирует ровно те байты, которые проверил |
| Веб-форма | Остаётся без фото | Этот план только про мобильное приложение. `/api/symptom-check` не трогаем |

## Общие ограничения

- Ветка `feature/photo-uploads`. Коммиты по-английски, одним предложением в стиле истории
  репозитория, последняя строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Миграция `supabase/migrations/20260923180000_photo_uploads.sql`: номер позже последнего,
  `20260923120000_feedback_per_check.sql`. Bucket создаётся **миграцией**, а не в `config.toml`:
  `supabase config push` запрещён, он перезаписывает URL авторизации на hosted-проектах.
- Миграцию не применять ни на staging, ни на production из ветки без явного согласия владельца.
  Это уже случалось (открытый вопрос 2.16).
- Имя bucket `check-photos`, путь объекта `<user_id>/<upload_id>`, без расширения.
- Коды ошибок только из контракта: неизвестный, чужой, просроченный или уже использованный
  `upload_id` → `bad_request`. Фактический формат не картинка или не из списка →
  `unsupported_media_type`. Размер или разрешение сверх лимита → `payload_too_large`.
- Журналы: ни `user_id`, ни путей объектов, ни байтов. Только код события.
- Новые SQL-функции: `security definer`, `set search_path = public`, `execute` только у
  `service_role`. Новая таблица: RLS включён, политик нет, `revoke all ... from anon, authenticated`.
- Код в `apps/web/src/server/**` не импортирует `next/*`. Новые серверные файлы в список
  `ADAPTERS` не добавляются.
- `packages/*` не импортирует Next.js, серверные SDK и DOM.
- Перед правкой маршрутов прочитать `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
- Интеграционные тесты ходят только в локальный Supabase: нужны Docker и `supabase start`, а
  `db-guard` не пустит тесты в облако.
- Нативные модули на телефоне добавляются впервые с момента фиксации `runtimeVersion`
  (политика `fingerprint`). Поэтому этот JS **нельзя** доставлять через EAS Update в уже
  установленные сборки: нужна новая сборка.

## На что смотреть ревьюеру

1. **Повторная отправка той же проверки.** Если телефон не получил ответ и повторил
   `POST /checks` с тем же `Idempotency-Key` и теми же `upload_ids`, он должен получить уже
   созданную задачу, а не `bad_request` «загрузка уже использована». Тест в задаче 6.
2. **Загрузку выдали, а файл так и не пришёл** (связь оборвалась на `PUT`). Проверка с этим
   `upload_id` отклоняется до резервирования кредита, объектов не остаётся. Тест в задаче 6.
3. **Одинаковые `upload_ids` в одном запросе.** Контракт отклоняет их, и один файл не уходит в AI
   дважды. Тест в задаче 1.
4. **Файл с подменённым `content-type`:** заявлен `image/jpeg`, а внутри текст или GIF. Ответ
   `unsupported_media_type`, кредит не тронут. Тесты в задачах 3 и 6.
5. **Удаление аккаунта сразу после загрузки.** Объекты пользователя удаляются до шага `data`,
   повторный запуск ничего не ломает. Тест в задаче 7.

---

### Задача 1. Контракт: лимиты фото, три файла, уникальные ids

**Файлы:**
- Изменить: `packages/contracts/src/analysis.ts:24-112`
- Изменить: `packages/contracts/src/openapi.ts:241-250`
- Обновить снимок: `apps/web/tests/unit/contracts/__snapshots__/openapi.test.ts.snap`
- Тесты: `apps/web/tests/unit/contracts/photo-uploads.test.ts`

**Интерфейсы:**
- Отдаёт из `@lapka/contracts`:
  - `PHOTO_LIMITS = { maxFiles: 3, maxBytes: 5_242_880, maxSide: 4096, grantSeconds: 900 } as const`
  - `UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`,
    `type UploadContentType`
  - `CheckCreateInputSchema.upload_ids`: не больше `PHOTO_LIMITS.maxFiles`, без повторов
  - `UploadRequestSchema.files`: от 1 до `PHOTO_LIMITS.maxFiles`, `size_bytes` от 1 до `PHOTO_LIMITS.maxBytes`

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/unit/contracts/photo-uploads.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CheckCreateInputSchema,
  PHOTO_LIMITS,
  UploadRequestSchema,
} from '@lapka/contracts'

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const check = (upload_ids: string[]) =>
  CheckCreateInputSchema.safeParse({ symptoms: 'вялый второй день', upload_ids })
const file = (overrides: Record<string, unknown> = {}) => ({
  content_type: 'image/jpeg',
  size_bytes: 400_000,
  ...overrides,
})

describe('photo limits in the contract', () => {
  it('allows up to three photos on a check', () => {
    expect(check([ID(1), ID(2), ID(3)]).success).toBe(true)
    expect(check([ID(1), ID(2), ID(3), ID(4)]).success).toBe(false)
  })

  it('refuses the same upload twice in one check', () => {
    expect(check([ID(1), ID(1)]).success).toBe(false)
  })

  it('asks for at most three files per upload request', () => {
    expect(UploadRequestSchema.safeParse({ files: [file(), file(), file()] }).success).toBe(true)
    expect(UploadRequestSchema.safeParse({ files: [file(), file(), file(), file()] }).success).toBe(false)
  })

  it('refuses a file over the size limit before handing out a grant', () => {
    expect(UploadRequestSchema.safeParse({ files: [file({ size_bytes: PHOTO_LIMITS.maxBytes })] }).success).toBe(true)
    expect(UploadRequestSchema.safeParse({ files: [file({ size_bytes: PHOTO_LIMITS.maxBytes + 1 })] }).success).toBe(false)
  })

  it('does not accept HEIC: the phone converts it, the server cannot read it', () => {
    expect(UploadRequestSchema.safeParse({ files: [file({ content_type: 'image/heic' })] }).success).toBe(false)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test --workspace @lapka/web -- tests/unit/contracts/photo-uploads.test.ts`
Expected: FAIL (`PHOTO_LIMITS` не экспортируется, пятый id проходит)

- [ ] **Шаг 3: Изменить контракт**

В `packages/contracts/src/analysis.ts` перед `CheckCreateInputSchema` добавить:

```ts
/**
 * Photos on one check. Owner's decision of 23 September 2026: three.
 *
 * `maxBytes` is also the bucket's own `file_size_limit`, so Storage refuses a
 * larger body even from a client that ignores this. `maxSide` guards the
 * server against an image whose header claims an absurd size. `grantSeconds`
 * is how long an upload may wait before it is attached to a check — shorter
 * than the two hours Storage gives the signed URL itself, which cannot be
 * changed.
 */
export const PHOTO_LIMITS = {
  maxFiles: 3,
  maxBytes: 5 * 1024 * 1024,
  maxSide: 4096,
  grantSeconds: 15 * 60,
} as const
```

Поле `upload_ids` в `CheckCreateInputSchema` заменить на:

```ts
  /** Ids handed out by POST /uploads; a raw URL is never accepted. */
  upload_ids: z
    .array(UuidSchema)
    .max(PHOTO_LIMITS.maxFiles)
    .refine((ids) => new Set(ids).size === ids.length, 'upload_ids must not repeat')
    .default([]),
```

Блок загрузок (`UPLOAD_CONTENT_TYPES` … `UploadRequestSchema`) заменить на:

```ts
// Uploads. The server hands out a scoped permission to write one immutable
// object; the client never tells the server which URL to read.
//
// Only what the AI provider reads. The phone turns HEIC into JPEG before
// asking; the server has nothing to decode HEIC with.
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number]

export const UploadRequestSchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        content_type: z.enum(UPLOAD_CONTENT_TYPES),
        size_bytes: z.int().min(1).max(PHOTO_LIMITS.maxBytes),
      }),
    )
    .min(1)
    .max(PHOTO_LIMITS.maxFiles),
})
```

В `packages/contracts/src/openapi.ts` у `/uploads` поменять ошибки и описание:

```ts
      '/uploads': {
        post: {
          summary: 'Scoped permission to upload photos to private storage',
          description:
            'One grant per file. PUT the file to `url` with exactly `headers` before `expires_at`, ' +
            'then pass the `upload_id`s to POST /checks. A declared size over the limit is refused here; ' +
            'the real bytes are checked again when the check is created.',
          requestBody: body('UploadRequest'),
          responses: {
            '201': json('UploadGrant', 'One grant per requested file'),
            ...commonErrors('bad_request', 'rate_limited'),
          },
        },
      },
```

- [ ] **Шаг 4: Прогнать тесты и обновить снимок OpenAPI**

Run: `npm test --workspace @lapka/web -- tests/unit/contracts/photo-uploads.test.ts`
Expected: PASS

Run: `npm run openapi:update --workspace @lapka/web && git diff --stat`
Expected: меняется только `.snap`. Прочитать diff: там только `/uploads`, `upload_ids` и схемы загрузок.

Run: `npm run typecheck`
Expected: PASS. Мобильный `check-form.ts` по-прежнему отправляет `upload_ids: []`.

- [ ] **Шаг 5: Коммит**

```bash
git add packages/contracts apps/web/tests/unit/contracts
git commit -m "Contract: three photos per check, JPEG/PNG/WebP up to 5 MB, no repeated upload ids"
```

---

### Задача 2. Миграция: bucket, таблица загрузок, привязка к проверке

**Файлы:**
- Создать: `supabase/migrations/20260923180000_photo_uploads.sql`
- Изменить: `apps/web/tests/integration/schema.test.ts` (`REQUIRED_TABLES`, `REQUIRED_FUNCTIONS`, `SERVICE_ONLY_TABLES`)
- Тесты: `apps/web/tests/integration/photo-uploads-sql.test.ts`

**Интерфейсы:**
- Bucket `check-photos`: `public = false`, `file_size_limit = 5242880`,
  `allowed_mime_types = {image/jpeg,image/png,image/webp}`.
- Таблица `public.photo_uploads(id uuid pk, user_id uuid → auth.users on delete cascade, object_path text unique, content_type text, size_bytes integer, created_at timestamptz, expires_at timestamptz, attached_at timestamptz null)`.
- `claim_photo_uploads(p_user_id uuid, p_ids uuid[]) returns table(id uuid, object_path text, content_type text)`
  проставляет `attached_at = now()` сразу у всех загрузок или ни у одной. Если какой-то id чужой,
  неизвестный, просроченный или уже привязанный, функция бросает исключение с сообщением
  `uploads_unavailable` и ничего не меняет.
- `mark_deletion_step` теперь принимает ещё и шаг `'photos'`.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/integration/photo-uploads-sql.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 6/01–6/02, the database half: the bucket's own limits and the one
 * function that turns uploads into photos of a check.
 */

let db: Client
let seeded: SeededFixtures

async function upload(userId: string, minutesLeft = 15): Promise<string> {
  const { rows } = await db.query(
    `insert into public.photo_uploads (user_id, object_path, content_type, size_bytes, expires_at)
     values ($1, $1 || '/' || gen_random_uuid(), 'image/jpeg', 1000, now() + make_interval(mins => $2))
     returning id`,
    [userId, minutesLeft],
  )
  return rows[0].id
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  seeded = await seedFixtures(db)
  await db.query('truncate table public.photo_uploads')
})

afterAll(async () => {
  await db?.end()
})

describe('check-photos bucket', () => {
  it('is private and limited to the three formats and 5 MB', async () => {
    const { rows } = await db.query(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'check-photos'`,
    )
    expect(rows).toEqual([
      { public: false, file_size_limit: '5242880', allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] },
    ])
  })
})

describe('claim_photo_uploads', () => {
  it('attaches the owner’s fresh uploads and returns where they are', async () => {
    const a = await upload(seeded.ownerAId)
    const b = await upload(seeded.ownerAId)

    const { rows } = await db.query('select * from public.claim_photo_uploads($1, $2)', [seeded.ownerAId, [a, b]])

    expect(rows.map((row) => row.id).sort()).toEqual([a, b].sort())
    const { rows: attached } = await db.query(
      'select count(*)::int as n from public.photo_uploads where attached_at is not null',
    )
    expect(attached[0].n).toBe(2)
  })

  it.each([
    ['someone else’s', async () => upload(seeded.ownerBId)],
    ['an expired one', async () => upload(seeded.ownerAId, -1)],
    ['an unknown id', async () => '00000000-0000-4000-8000-000000000000'],
  ])('refuses the whole set when one of them is %s, and attaches nothing', async (_label, make) => {
    const good = await upload(seeded.ownerAId)
    const bad = await make()

    await expect(
      db.query('select * from public.claim_photo_uploads($1, $2)', [seeded.ownerAId, [good, bad]]),
    ).rejects.toThrow(/uploads_unavailable/)

    const { rows } = await db.query('select attached_at from public.photo_uploads where id = $1', [good])
    expect(rows[0].attached_at).toBeNull()
  })

  it('does not attach the same upload to a second check', async () => {
    const a = await upload(seeded.ownerAId)
    await db.query('select * from public.claim_photo_uploads($1, $2)', [seeded.ownerAId, [a]])

    await expect(
      db.query('select * from public.claim_photo_uploads($1, $2)', [seeded.ownerAId, [a]]),
    ).rejects.toThrow(/uploads_unavailable/)
  })

  it('is not callable by signed-in users', async () => {
    const { rows } = await db.query(
      `select has_function_privilege('authenticated', 'public.claim_photo_uploads(uuid, uuid[])', 'execute') as can`,
    )
    expect(rows[0].can).toBe(false)
  })
})

describe('mark_deletion_step', () => {
  it('knows the photos step', async () => {
    const { rows } = await db.query(`select pg_get_functiondef('public.mark_deletion_step(uuid, text)'::regprocedure) as def`)
    expect(rows[0].def).toContain(`'photos'`)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `supabase start && npm run test:integration -- tests/integration/photo-uploads-sql.test.ts`
Expected: FAIL (`relation "public.photo_uploads" does not exist`)

- [ ] **Шаг 3: Написать миграцию**

Создать `supabase/migrations/20260923180000_photo_uploads.sql`:

```sql
-- Photographs on a symptom check (stage 6/01–6/03).
--
-- Vercel cuts off any request body over 4.5 MB before our code runs, and a
-- couple of phone photos were enough to hit that (open question 0.1). So photos
-- never pass through the server: the phone writes each one straight into a
-- private bucket through a signed upload URL, and the server is told only the
-- upload's id.
--
-- Nothing here is kept. The owner decided on 6 September 2026 that a photo
-- lives only as long as its analysis: removed right after it, successful or
-- not, and an abandoned upload is swept once its grant has run out. The table
-- is the server's record of what it handed out, not a gallery.

-- The bucket is created here and not in config.toml: `supabase config push` is
-- never run against hosted projects, it would overwrite their auth URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('check-photos', 'check-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No policies on storage.objects for this bucket, on purpose: neither `anon`
-- nor `authenticated` may read, list, overwrite or delete a photo. Writing
-- happens only through a signed upload URL the server issued, and it refuses
-- to overwrite an existing object.

create table if not exists public.photo_uploads (
  id uuid primary key default gen_random_uuid(),

  -- Cascading: the deletion worker removes the objects first (step `photos`),
  -- and a row whose object is gone describes nothing.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- `<user_id>/<id>`. Unique, so one grant is one object.
  object_path text not null unique,

  content_type text not null,
  size_bytes integer not null,

  created_at timestamptz not null default now(),

  -- Until when the upload may be attached to a check. Shorter than the signed
  -- URL itself, whose two hours Storage fixes and we cannot change.
  expires_at timestamptz not null,

  -- Set when a check takes the upload. Once set, no other check can.
  attached_at timestamptz
);

alter table public.photo_uploads
  drop constraint if exists photo_uploads_content_type_check;
alter table public.photo_uploads
  add constraint photo_uploads_content_type_check
  check (content_type in ('image/jpeg', 'image/png', 'image/webp'));

alter table public.photo_uploads
  drop constraint if exists photo_uploads_size_check;
alter table public.photo_uploads
  add constraint photo_uploads_size_check
  check (size_bytes between 1 and 5242880);

-- The sweeper walks uploads by age.
create index if not exists photo_uploads_created_idx on public.photo_uploads (created_at);
create index if not exists photo_uploads_user_idx on public.photo_uploads (user_id);

alter table public.photo_uploads enable row level security;
-- No policies: only the service role touches this table.
revoke all on public.photo_uploads from anon, authenticated;

/**
 * Takes uploads for one check: all of them, or none.
 *
 * All-or-none because a check analysed with two of the three photos the person
 * attached would look to them like the third was considered. Raising rolls back
 * every `attached_at` this call set.
 */
create or replace function public.claim_photo_uploads(p_user_id uuid, p_ids uuid[])
returns table (id uuid, object_path text, content_type text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Lock first, then count. Two checks racing for one upload both wait here;
  -- the second re-reads the row after the first commits, finds `attached_at`
  -- set, and counts one short. Column names are qualified throughout: the
  -- output columns `id`, `object_path`, `content_type` are variables here.
  select count(*) into v_count
    from (
      select 1
        from public.photo_uploads u
       where u.id = any(p_ids)
         and u.user_id = p_user_id
         and u.attached_at is null
         and u.expires_at > now()
         for update
    ) as usable;

  if v_count <> coalesce(cardinality(p_ids), 0) then
    raise exception 'uploads_unavailable' using errcode = 'P0001';
  end if;

  return query
    update public.photo_uploads u
       set attached_at = now()
     where u.id = any(p_ids)
       and u.user_id = p_user_id
    returning u.id, u.object_path, u.content_type;
end;
$$;

revoke all on function public.claim_photo_uploads(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_photo_uploads(uuid, uuid[]) to service_role;

-- The deletion worker gets a step before `data`: photos in Storage are not rows
-- a transaction can remove, and they must be gone before the Auth user is.
create or replace function public.mark_deletion_step(p_user_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_step not in ('photos', 'data', 'auth') then
    raise exception 'unknown deletion step %', p_step using errcode = 'invalid_parameter_value';
  end if;

  update public.deletion_jobs
     set progress = progress || jsonb_build_object(p_step, now()),
         updated_at = now()
   where user_id = p_user_id
     and status in ('pending', 'in_progress');

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'no active deletion job for %', p_user_id using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.mark_deletion_step(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_deletion_step(uuid, text) to service_role;
```

Перед записью сверить тело `mark_deletion_step` с `supabase/migrations/20260917120000_deletion_worker.sql:62-86`.
Отличаться должен только список шагов.

- [ ] **Шаг 4: Добавить таблицу и функцию в `schema.test.ts`**

В `apps/web/tests/integration/schema.test.ts` вставить `'photo_uploads'` в `REQUIRED_TABLES` и
`SERVICE_ONLY_TABLES`, а `'claim_photo_uploads'` в `REQUIRED_FUNCTIONS`. Во всех трёх
списках сохранить алфавитный порядок, потому что тест сравнивает их с отсортированным ответом базы.

- [ ] **Шаг 5: Прогнать тесты**

Run: `supabase migration up --local && npm run test:integration -- tests/integration/photo-uploads-sql.test.ts tests/integration/schema.test.ts tests/integration/deletion-worker-sql.test.ts`
Expected: PASS

- [ ] **Шаг 6: Коммит**

```bash
git add supabase/migrations/20260923180000_photo_uploads.sql apps/web/tests/integration
git commit -m "Private check-photos bucket and the table that hands out and claims uploads"
```

---

### Задача 3. Проверка байтов фото на сервере

**Файлы:**
- Изменить: `apps/web/package.json` (зависимость `image-size@^2.0.4`)
- Создать: `apps/web/src/server/uploads/photo-verify.ts`
- Тесты: `apps/web/tests/server/uploads/photo-verify.test.ts`

**Интерфейсы:**
- Отдаёт:
  - `verifyPhoto(bytes: Uint8Array): PhotoVerdict`
  - `type PhotoVerdict = { ok: true; photo: AnalysisPhoto } | { ok: false; code: 'unsupported_media_type' | 'payload_too_large'; message: string }`
  - `AnalysisPhoto` уже есть: `{ data: string /* base64 */; mimeType: string }` в `analyze-symptom-check.ts:148`.

- [ ] **Шаг 1: Установить зависимость**

Run: `npm install image-size@^2.0.4 --workspace @lapka/web`
Expected: в `apps/web/package.json` появилась `"image-size": "^2.0.4"`.

- [ ] **Шаг 2: Написать падающие тесты**

Создать `apps/web/tests/server/uploads/photo-verify.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PHOTO_LIMITS } from '@lapka/contracts'
import { verifyPhoto } from '@/server/uploads/photo-verify'

/** Enough of a PNG for its header to be read: signature and IHDR. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  bytes.set([8, 6, 0, 0, 0], 24)
  return bytes
}

/**
 * Enough of a JPEG: SOI, an empty APP0, then a baseline SOF0 carrying the size.
 * The APP0 is not decoration — image-size skips the first segment unread, so a
 * SOF0 placed first would never be found.
 */
function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x02,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ])
}

const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00')

describe('verifyPhoto', () => {
  it('passes a JPEG on with its real type and base64 bytes', () => {
    const bytes = jpeg(1600, 1200)
    const verdict = verifyPhoto(bytes)
    expect(verdict).toEqual({
      ok: true,
      photo: { mimeType: 'image/jpeg', data: Buffer.from(bytes).toString('base64') },
    })
  })

  it('names the type from the bytes, not from what was declared', () => {
    expect(verifyPhoto(png(800, 600))).toMatchObject({ ok: true, photo: { mimeType: 'image/png' } })
  })

  it('refuses something that is not an image at all', () => {
    expect(verifyPhoto(new TextEncoder().encode('hello, not a photo'))).toMatchObject({
      ok: false,
      code: 'unsupported_media_type',
    })
  })

  it('refuses an image in a format the AI provider is not given', () => {
    expect(verifyPhoto(GIF)).toMatchObject({ ok: false, code: 'unsupported_media_type' })
  })

  it('refuses an image wider or taller than the limit', () => {
    expect(verifyPhoto(png(PHOTO_LIMITS.maxSide, PHOTO_LIMITS.maxSide))).toMatchObject({ ok: true })
    expect(verifyPhoto(png(PHOTO_LIMITS.maxSide + 1, 10))).toMatchObject({ ok: false, code: 'payload_too_large' })
    expect(verifyPhoto(jpeg(10, PHOTO_LIMITS.maxSide + 1))).toMatchObject({ ok: false, code: 'payload_too_large' })
  })

  it('refuses a file over the byte limit without reading it', () => {
    const big = new Uint8Array(PHOTO_LIMITS.maxBytes + 1)
    big.set(jpeg(100, 100))
    expect(verifyPhoto(big)).toMatchObject({ ok: false, code: 'payload_too_large' })
  })
})
```

- [ ] **Шаг 3: Убедиться, что тесты падают**

Run: `npm test --workspace @lapka/web -- tests/server/uploads/photo-verify.test.ts`
Expected: FAIL (`Cannot find module '@/server/uploads/photo-verify'`)

Если после реализации (шаг 4) `image-size` не читает самодельные заголовки, фикстуры не
подгонять под парсер вслепую. Надо сохранить настоящие маленькие файлы (JPEG 1600×1200, PNG
800×600, PNG 4097×10) в `apps/web/tests/server/uploads/fixtures/`, созданные любым редактором или
`sips` на macOS, и читать их через `readFileSync`.

- [ ] **Шаг 4: Реализация**

Создать `apps/web/src/server/uploads/photo-verify.ts`:

```ts
import { imageSize } from 'image-size'
import { PHOTO_LIMITS } from '@lapka/contracts'
import type { AnalysisPhoto } from '@/server/symptom-check/analyze-symptom-check'

/**
 * What a photo really is, decided from its bytes (stage 6/02).
 *
 * The content type the phone declared, and the one Storage checked against the
 * bucket, are both only what the uploader said. The header is read here, not
 * decoded: that is enough to know the format and the size, and it cannot be
 * made to allocate a huge bitmap.
 */

const MIME_BY_TYPE: Record<string, AnalysisPhoto['mimeType']> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export type PhotoVerdict =
  | { ok: true; photo: AnalysisPhoto }
  | { ok: false; code: 'unsupported_media_type' | 'payload_too_large'; message: string }

export function verifyPhoto(bytes: Uint8Array): PhotoVerdict {
  if (bytes.byteLength > PHOTO_LIMITS.maxBytes) {
    return { ok: false, code: 'payload_too_large', message: 'Фото больше 5 МБ' }
  }

  let size: ReturnType<typeof imageSize>
  try {
    size = imageSize(bytes)
  } catch {
    return { ok: false, code: 'unsupported_media_type', message: 'Файл не похож на фотографию' }
  }

  const mimeType = size.type ? MIME_BY_TYPE[size.type] : undefined
  if (!mimeType) {
    return { ok: false, code: 'unsupported_media_type', message: 'Поддерживаются JPEG, PNG и WebP' }
  }

  if (size.width > PHOTO_LIMITS.maxSide || size.height > PHOTO_LIMITS.maxSide) {
    return { ok: false, code: 'payload_too_large', message: 'Разрешение фото слишком большое' }
  }

  return { ok: true, photo: { mimeType, data: Buffer.from(bytes).toString('base64') } }
}
```

В `analyze-symptom-check.ts` импортируется `openai` и сервер-онли модули. Если `import type`
всё же потянет их в unit-тест, вынести `AnalysisPhoto` в `apps/web/src/server/symptom-check/analysis-photo.ts`
и реэкспортировать его из `analyze-symptom-check.ts`.

- [ ] **Шаг 5: Прогнать тесты**

Run: `npm test --workspace @lapka/web -- tests/server/uploads/photo-verify.test.ts tests/server/architecture`
Expected: PASS

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web/package.json package-lock.json apps/web/src/server/uploads apps/web/tests/server/uploads
git commit -m "Tell a photo by its bytes: JPEG, PNG or WebP, at most 5 MB and 4096 px a side"
```

---

### Задача 4. Хранилище: выдать загрузку, удалить, подмести

**Файлы:**
- Создать: `apps/web/src/server/uploads/photo-storage.ts`
- Тесты: `apps/web/tests/integration/photo-storage.test.ts`

**Интерфейсы:**
- Отдаёт:
  - `PHOTO_BUCKET = 'check-photos'`
  - `SWEEP_AFTER_SECONDS = 3 * 60 * 60`
  - `grantUploads(supabase, userId: string, files: UploadRequest['files'], now?: Date): Promise<UploadGrant | null>`.
    `null` означает, что Storage или база не ответили, и тогда ни одной строки не остаётся.
  - `removeUploads(supabase, uploads: { id: string; object_path: string }[]): Promise<void>`.
    Сначала удаляются объекты, потом строки. Ничего не бросает, ошибку пишет в журнал.
  - `removeUserPhotos(supabase, userId: string): Promise<void>` удаляет все объекты под
    `<userId>/` и все строки пользователя. При сбое бросает исключение: его ловит обработчик удаления.
  - `sweepExpiredUploads(supabase, now?: Date, limit = 200): Promise<number>` удаляет загрузки
    старше `SWEEP_AFTER_SECONDS` и возвращает их число.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/integration/photo-storage.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'
import {
  PHOTO_BUCKET,
  grantUploads,
  removeUploads,
  removeUserPhotos,
  sweepExpiredUploads,
} from '@/server/uploads/photo-storage'

/**
 * Stage 6/01 against real local Storage: what a signed upload lets the phone
 * do, and what it does not.
 */

let db: Client
let seeded: SeededFixtures

function service(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// A real, tiny JPEG is not needed here: Storage checks the declared type
// against the bucket, and the bytes are verified later by photo-verify.
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

async function put(grant: { url: string; headers: Record<string, string> }, body = BYTES) {
  return fetch(grant.url, { method: 'PUT', headers: grant.headers, body })
}

async function objectCount(): Promise<number> {
  const { rows } = await db.query(`select count(*)::int as n from storage.objects where bucket_id = $1`, [PHOTO_BUCKET])
  return rows[0].n
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  seeded = await seedFixtures(db)
  await service().storage.emptyBucket(PHOTO_BUCKET)
  await db.query('truncate table public.photo_uploads')
})

afterAll(async () => {
  await db?.end()
})

describe('grantUploads', () => {
  it('hands out one PUT per file, valid for fifteen minutes, and records each', async () => {
    const now = new Date()
    const grant = await grantUploads(service() as never, seeded.ownerAId, [
      { content_type: 'image/jpeg', size_bytes: 4 },
      { content_type: 'image/png', size_bytes: 4 },
    ], now)

    expect(grant?.uploads).toHaveLength(2)
    expect(grant!.uploads[0]).toMatchObject({ method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' } })
    expect(new Date(grant!.uploads[0].expires_at).getTime() - now.getTime()).toBe(15 * 60 * 1000)

    const { rows } = await db.query('select user_id, object_path from public.photo_uploads order by created_at')
    expect(rows).toHaveLength(2)
    expect(rows[0].object_path.startsWith(`${seeded.ownerAId}/`)).toBe(true)
  })

  it('lets the phone write the file with nothing but the grant', async () => {
    const grant = await grantUploads(service() as never, seeded.ownerAId, [{ content_type: 'image/jpeg', size_bytes: 4 }])
    const response = await put(grant!.uploads[0])
    expect(response.ok).toBe(true)
    expect(await objectCount()).toBe(1)
  })

  it('does not let the same grant overwrite the object once written', async () => {
    const grant = await grantUploads(service() as never, seeded.ownerAId, [{ content_type: 'image/jpeg', size_bytes: 4 }])
    await put(grant!.uploads[0])
    const second = await put(grant!.uploads[0], new Uint8Array([1, 2, 3, 4]))
    expect(second.ok).toBe(false)
  })

  it('refuses a type the bucket does not allow, whatever the grant said', async () => {
    const grant = await grantUploads(service() as never, seeded.ownerAId, [{ content_type: 'image/jpeg', size_bytes: 4 }])
    const response = await put({ ...grant!.uploads[0], headers: { ...grant!.uploads[0].headers, 'content-type': 'text/html' } })
    expect(response.ok).toBe(false)
  })

  it('does not let anyone read the photo back without the service key', async () => {
    const grant = await grantUploads(service() as never, seeded.ownerAId, [{ content_type: 'image/jpeg', size_bytes: 4 }])
    await put(grant!.uploads[0])
    const { rows } = await db.query('select object_path from public.photo_uploads')

    const anon = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!)
    const { data, error } = await anon.storage.from(PHOTO_BUCKET).download(rows[0].object_path)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})

describe('removing photos', () => {
  it('removes the objects and the rows of the uploads it is given', async () => {
    const grant = await grantUploads(service() as never, seeded.ownerAId, [{ content_type: 'image/jpeg', size_bytes: 4 }])
    await put(grant!.uploads[0])
    const { rows } = await db.query('select id, object_path from public.photo_uploads')

    await removeUploads(service() as never, rows)

    expect(await objectCount()).toBe(0)
    const { rows: left } = await db.query('select count(*)::int as n from public.photo_uploads')
    expect(left[0].n).toBe(0)
  })

  it('removes everything one person uploaded, and nothing of anyone else’s', async () => {
    for (const owner of [seeded.ownerAId, seeded.ownerAId, seeded.ownerBId]) {
      const grant = await grantUploads(service() as never, owner, [{ content_type: 'image/jpeg', size_bytes: 4 }])
      await put(grant!.uploads[0])
    }

    await removeUserPhotos(service() as never, seeded.ownerAId)

    expect(await objectCount()).toBe(1)
    const { rows } = await db.query('select user_id from public.photo_uploads')
    expect(rows).toEqual([{ user_id: seeded.ownerBId }])
  })

  it('sweeps only uploads older than three hours', async () => {
    for (let i = 0; i < 2; i++) {
      const grant = await grantUploads(service() as never, seeded.ownerAId, [{ content_type: 'image/jpeg', size_bytes: 4 }])
      await put(grant!.uploads[0])
    }
    await db.query(
      `update public.photo_uploads set created_at = now() - interval '3 hours 1 minute'
        where id = (select id from public.photo_uploads order by created_at limit 1)`,
    )

    expect(await sweepExpiredUploads(service() as never)).toBe(1)
    expect(await objectCount()).toBe(1)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm run test:integration -- tests/integration/photo-storage.test.ts`
Expected: FAIL (`Cannot find module '@/server/uploads/photo-storage'`)

- [ ] **Шаг 3: Реализация**

Создать `apps/web/src/server/uploads/photo-storage.ts`:

```ts
import 'server-only'

import { randomUUID } from 'node:crypto'
import { PHOTO_LIMITS, type UploadGrant, type UploadRequest } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Photos in private Storage (stage 6/01).
 *
 * The phone never sends a photo through our server — Vercel would cut the body
 * off at 4.5 MB. It asks here for a signed upload URL per file and writes the
 * file there itself. A signed upload URL lets exactly one object be created at
 * exactly one path, and with `upsert: false` it cannot replace one.
 *
 * Nothing is kept: a photo is removed right after its analysis, and anything
 * never attached to a check is swept once the signed URL — two hours, fixed by
 * Storage — can no longer write it.
 */

export const PHOTO_BUCKET = 'check-photos'

/** Two hours of signed URL, plus room for a slow last write. */
export const SWEEP_AFTER_SECONDS = 3 * 60 * 60

export async function grantUploads(
  supabase: SupabaseService,
  userId: string,
  files: UploadRequest['files'],
  now: Date = new Date(),
): Promise<UploadGrant | null> {
  const expiresAt = new Date(now.getTime() + PHOTO_LIMITS.grantSeconds * 1000).toISOString()
  const rows = files.map((file) => {
    const id = randomUUID()
    return {
      id,
      user_id: userId,
      object_path: `${userId}/${id}`,
      content_type: file.content_type,
      size_bytes: file.size_bytes,
      expires_at: expiresAt,
    }
  })

  const { error: insertError } = await supabase.from('photo_uploads').insert(rows)
  if (insertError) {
    console.error('[photo-uploads] grant_insert_failed')
    return null
  }

  const uploads: UploadGrant['uploads'] = []
  for (const row of rows) {
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(row.object_path, { upsert: false })
    if (error || !data) {
      console.error('[photo-uploads] grant_sign_failed')
      await supabase.from('photo_uploads').delete().in('id', rows.map((r) => r.id))
      return null
    }
    uploads.push({
      upload_id: row.id,
      url: data.signedUrl,
      method: 'PUT',
      headers: { 'content-type': row.content_type, 'x-upsert': 'false' },
      expires_at: expiresAt,
    })
  }

  return { uploads }
}

/**
 * Objects first, rows second: a row left behind is swept later, an object
 * left without a row would be found only by listing the bucket.
 */
export async function removeUploads(
  supabase: SupabaseService,
  uploads: { id: string; object_path: string }[],
): Promise<void> {
  if (uploads.length === 0) return

  const { error: storageError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove(uploads.map((upload) => upload.object_path))
  if (storageError) {
    // The sweeper gets it within a day; the row stays so it knows where.
    console.error('[photo-uploads] remove_objects_failed')
    return
  }

  const { error } = await supabase.from('photo_uploads').delete().in('id', uploads.map((u) => u.id))
  if (error) console.error('[photo-uploads] remove_rows_failed')
}

/**
 * Everything under one person's folder, whether or not a row still points at
 * it. Used by account deletion, which must not leave a photo behind because a
 * row was lost. Throws, so the worker counts a failed attempt.
 */
export async function removeUserPhotos(supabase: SupabaseService, userId: string): Promise<void> {
  const bucket = supabase.storage.from(PHOTO_BUCKET)
  for (;;) {
    const { data, error } = await bucket.list(userId, { limit: 100 })
    if (error) throw new Error('list failed')
    if (!data || data.length === 0) break
    const { error: removeError } = await bucket.remove(data.map((object) => `${userId}/${object.name}`))
    if (removeError) throw new Error('remove failed')
  }

  const { error } = await supabase.from('photo_uploads').delete().eq('user_id', userId)
  if (error) throw new Error('rows delete failed')
}

/** @returns how many abandoned uploads were removed. */
export async function sweepExpiredUploads(
  supabase: SupabaseService,
  now: Date = new Date(),
  limit = 200,
): Promise<number> {
  const cutoff = new Date(now.getTime() - SWEEP_AFTER_SECONDS * 1000).toISOString()
  const { data, error } = await supabase
    .from('photo_uploads')
    .select('id, object_path')
    .lt('created_at', cutoff)
    .order('created_at')
    .limit(limit)
  if (error) throw new Error('sweep select failed')
  if (!data || data.length === 0) return 0

  const { error: storageError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove(data.map((upload) => upload.object_path))
  if (storageError) throw new Error('sweep remove failed')

  const { error: deleteError } = await supabase.from('photo_uploads').delete().in('id', data.map((u) => u.id))
  if (deleteError) throw new Error('sweep delete failed')
  return data.length
}
```

`UploadGrant` и `UploadRequest` уже экспортируются из `@lapka/contracts`, см. `analysis.ts`.

- [ ] **Шаг 4: Прогнать тесты**

Run: `npm run test:integration -- tests/integration/photo-storage.test.ts`
Expected: PASS. Если `lets the phone write the file with nothing but the grant` падает с 400 или 401
от шлюза, значит локальный Kong требует `apikey`. Тогда проверить то же самое через hosted
staging вручную (задача 10, шаг 3). Если и там нужен ключ, добавить `apikey: <anon key>` в
`headers` гранта: anon-ключ публичный, он уже лежит в приложении.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web/src/server/uploads/photo-storage.ts apps/web/tests/integration/photo-storage.test.ts
git commit -m "Grant, remove and sweep photo uploads in the private bucket"
```

---

### Задача 5. Маршрут `POST /api/v1/uploads`

**Файлы:**
- Создать: `apps/web/src/app/(backend)/api/v1/uploads/route.ts`
- Изменить: `apps/web/src/server/api/rate-limit.ts:15-27` (лимит `upload_create`)
- Тесты: `apps/web/tests/integration/api-uploads.test.ts`

**Интерфейсы:**
- Использует: `grantUploads` из задачи 4, `UploadRequestSchema` и `UploadGrantSchema` из задачи 1,
  `withApiAuth`, `apiSuccess`, `apiError`, `consumeRateLimit`.
- Отдаёт: `201` с `UploadGrant`, `400` на неверное тело, `429` при исчерпанном лимите, `503`, если Storage недоступен.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/integration/api-uploads.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, UploadGrantSchema } from '@lapka/contracts'
import { POST as requestUploads } from '@/app/(backend)/api/v1/uploads/route'
import { FIXTURE_PASSWORD, OWNER_A, connect, resetFixtures, seedFixtures } from './fixtures'

let db: Client
let token: string

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function post(body: unknown) {
  return new NextRequest('http://test.local/api/v1/uploads', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  await seedFixtures(db)
  await db.query('truncate table public.photo_uploads, public.api_rate_limits')
  token = await signIn(OWNER_A.email)
})

afterAll(async () => {
  await db?.end()
})

describe('POST /api/v1/uploads', () => {
  it('answers 201 with one grant per file, in the contract’s shape', async () => {
    const response = await requestUploads(
      post({ files: [{ content_type: 'image/jpeg', size_bytes: 400_000 }] }),
      undefined,
    )
    expect(response.status).toBe(201)
    expect(UploadGrantSchema.parse(await response.json()).uploads).toHaveLength(1)
  })

  it('refuses a fourth file with 400 and hands out nothing', async () => {
    const file = { content_type: 'image/jpeg', size_bytes: 1 }
    const response = await requestUploads(post({ files: [file, file, file, file] }), undefined)
    expect(response.status).toBe(400)
    expect(ApiErrorEnvelopeSchema.parse(await response.json()).error.code).toBe('bad_request')
    const { rows } = await db.query('select count(*)::int as n from public.photo_uploads')
    expect(rows[0].n).toBe(0)
  })

  it('refuses a caller without a session', async () => {
    const response = await requestUploads(
      new NextRequest('http://test.local/api/v1/uploads', { method: 'POST', body: '{}' }),
      undefined,
    )
    expect(response.status).toBe(401)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm run test:integration -- tests/integration/api-uploads.test.ts`
Expected: FAIL (маршрута нет)

- [ ] **Шаг 3: Лимит частоты**

В `RATE_LIMITS` (`apps/web/src/server/api/rate-limit.ts`) добавить после `analysis_create`:

```ts
  /**
   * Each call reserves Storage for up to three photos. Generous next to
   * `analysis_create`: a person may pick photos again before sending.
   */
  upload_create: { limit: 30, windowSeconds: 60 * 60 },
```

- [ ] **Шаг 4: Маршрут**

Прочитать `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
Затем создать `apps/web/src/app/(backend)/api/v1/uploads/route.ts`:

```ts
import type { NextRequest } from 'next/server'
import { UploadRequestSchema } from '@lapka/contracts'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { apiError, apiSuccess } from '@/server/api/response'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { createServiceClient } from '@/server/supabase/server'
import { grantUploads } from '@/server/uploads/photo-storage'

/**
 * Permission to put photos into private storage (stage 6/01).
 *
 * The files themselves never come here: Vercel would refuse a body of a few
 * phone photos before this code ran. The phone PUTs each one to the URL it gets
 * back, then names the upload ids when it creates the check.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = UploadRequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const supabase = createServiceClient()
  const rate = await consumeRateLimit(supabase, 'upload_create', context.account.userId)
  if (!rate.allowed) {
    return apiError(context.requestId, 'rate_limited', 'Too many uploads, try again later.')
  }

  const grant = await grantUploads(supabase, context.account.userId, parsed.data.files)
  if (!grant) {
    return apiError(context.requestId, 'dependency_unavailable', 'Storage is unavailable')
  }

  return apiSuccess(context.requestId, grant, 201)
})
```

Сверить импорты `withApiAuth`, `ApiContext`, `apiError`, `apiSuccess` с
`apps/web/src/app/(backend)/api/v1/checks/route.ts`: пути должны совпасть.

- [ ] **Шаг 5: Прогнать тесты**

Run: `npm run test:integration -- tests/integration/api-uploads.test.ts && npm test --workspace @lapka/web`
Expected: PASS

- [ ] **Шаг 6: Коммит**

```bash
git add "apps/web/src/app/(backend)/api/v1/uploads" apps/web/src/server/api/rate-limit.ts apps/web/tests/integration/api-uploads.test.ts
git commit -m "POST /api/v1/uploads hands out signed upload URLs for up to three photos"
```

---

### Задача 6. Проверка с фото: привязать, проверить, проанализировать, удалить

**Файлы:**
- Создать: `apps/web/src/server/uploads/photo-attach.ts`
- Изменить: `apps/web/src/server/checks/check-job-service.ts:1-13, 63-131`
- Изменить: `apps/web/tests/integration/check-jobs.test.ts` (тест `refuses uploads while photographs are switched off` заменяется)
- Тесты: `apps/web/tests/integration/check-jobs-photos.test.ts`

**Интерфейсы:**
- Использует: RPC `claim_photo_uploads` (задача 2), `verifyPhoto` (задача 3), `PHOTO_BUCKET`
  и `removeUploads` (задача 4).
- Отдаёт:
  - `type ClaimedUpload = { id: string; object_path: string }`
  - `loadPhotosForCheck(supabase, userId: string, uploadIds: string[]): Promise<LoadedPhotos>`
  - `type LoadedPhotos = { ok: true; photos: AnalysisPhoto[]; uploads: ClaimedUpload[] } | { ok: false; code: ErrorCode; message: string }`.
    На любой отказ после привязки загрузки уже удалены.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/web/tests/integration/check-jobs-photos.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { CHECK_IDS, connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'
import { createCheckJob, type Analyse } from '@/server/checks/check-job-service'
import { PHOTO_BUCKET, grantUploads } from '@/server/uploads/photo-storage'

/**
 * Stage 6/02: what a check does with the photos it was given. The AI call is
 * a fake that records what it received — the point is everything around it.
 */

let db: Client
let fixtures: SeededFixtures

function service(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// 1600×1200. The empty APP0 before SOF0 is needed: see photo-verify.test.ts.
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40,
  0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
])

/** Asks for grants and writes each file, as the phone would. */
async function uploaded(userId: string, bodies: Uint8Array[]): Promise<string[]> {
  const grant = await grantUploads(
    service() as never,
    userId,
    bodies.map((body) => ({ content_type: 'image/jpeg' as const, size_bytes: body.byteLength })),
  )
  for (const [i, upload] of grant!.uploads.entries()) {
    const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bodies[i] })
    if (!response.ok) throw new Error(`upload failed: ${response.status}`)
  }
  return grant!.uploads.map((upload) => upload.upload_id)
}

function recording() {
  const seen: { photos: number; calls: number } = { photos: 0, calls: 0 }
  const analyse: Analyse = async (_supabase, input) => {
    seen.calls += 1
    seen.photos = input.photos.length
    return {
      ok: true,
      result: {} as never,
      checkId: CHECK_IDS.aFirst,
      creditsRemaining: 4,
      hasPhoto: input.photos.length > 0,
      quickAssessment: { appetite: null, activity: null, duration: null, stool: null, pain_signs: [] },
    }
  }
  return { seen, analyse }
}

function request(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    idempotencyKey: null,
    pet_id: null,
    symptoms: 'хромает на заднюю лапу',
    upload_ids: [],
    appetite: null,
    activity: null,
    duration: null,
    stool: null,
    pain_signs: [],
    ...overrides,
  } as Parameters<typeof createCheckJob>[1]
}

async function counts() {
  const { rows } = await db.query(`
    select (select count(*)::int from storage.objects where bucket_id = '${PHOTO_BUCKET}') as objects,
           (select count(*)::int from public.photo_uploads) as uploads,
           (select count(*)::int from public.check_jobs) as jobs`)
  return rows[0] as { objects: number; uploads: number; jobs: number }
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  fixtures = await seedFixtures(db)
  await service().storage.emptyBucket(PHOTO_BUCKET)
  await db.query('truncate table public.check_jobs, public.photo_uploads')
})

afterAll(async () => {
  await db?.end()
})

describe('a check with photos', () => {
  it('gives the analysis every photo, then leaves nothing in storage', async () => {
    const ids = await uploaded(fixtures.ownerAId, [JPEG, JPEG, JPEG])
    const { seen, analyse } = recording()

    const outcome = await createCheckJob(service() as never, request(fixtures.ownerAId, { upload_ids: ids }), analyse)

    expect(outcome).toMatchObject({ ok: true })
    expect(seen.photos).toBe(3)
    expect(await counts()).toEqual({ objects: 0, uploads: 0, jobs: 1 })
  })

  it('removes the photos when the analysis fails too', async () => {
    const ids = await uploaded(fixtures.ownerAId, [JPEG])
    const fails: Analyse = async () => ({ ok: false, code: 'dependency_unavailable', message: 'AI недоступен' })

    await createCheckJob(service() as never, request(fixtures.ownerAId, { upload_ids: ids }), fails)

    expect(await counts()).toMatchObject({ objects: 0, uploads: 0 })
  })

  it('refuses a granted upload whose file never arrived, before any job or credit', async () => {
    const grant = await grantUploads(service() as never, fixtures.ownerAId, [{ content_type: 'image/jpeg', size_bytes: 10 }])
    const { seen, analyse } = recording()

    const outcome = await createCheckJob(
      service() as never,
      request(fixtures.ownerAId, { upload_ids: [grant!.uploads[0].upload_id] }),
      analyse,
    )

    expect(outcome).toMatchObject({ ok: false, code: 'bad_request' })
    expect(seen.calls).toBe(0)
    expect(await counts()).toEqual({ objects: 0, uploads: 0, jobs: 0 })
  })

  it('refuses a file that only claims to be a JPEG, and removes it', async () => {
    const ids = await uploaded(fixtures.ownerAId, [new TextEncoder().encode('<html>not a photo</html>')])
    const { seen, analyse } = recording()

    const outcome = await createCheckJob(service() as never, request(fixtures.ownerAId, { upload_ids: ids }), analyse)

    expect(outcome).toMatchObject({ ok: false, code: 'unsupported_media_type' })
    expect(seen.calls).toBe(0)
    expect(await counts()).toEqual({ objects: 0, uploads: 0, jobs: 0 })
  })

  it('refuses someone else’s upload and leaves it to its owner', async () => {
    const theirs = await uploaded(fixtures.ownerBId, [JPEG])
    const { analyse } = recording()

    const outcome = await createCheckJob(service() as never, request(fixtures.ownerAId, { upload_ids: theirs }), analyse)

    expect(outcome).toMatchObject({ ok: false, code: 'bad_request' })
    expect(await counts()).toMatchObject({ objects: 1, uploads: 1 })
  })

  it('answers a repeat of the same request with the job already made', async () => {
    const ids = await uploaded(fixtures.ownerAId, [JPEG])
    const { analyse } = recording()
    const same = request(fixtures.ownerAId, { upload_ids: ids, idempotencyKey: 'photo-repeat-0001' })

    const first = await createCheckJob(service() as never, same, analyse)
    const again = await createCheckJob(service() as never, same, analyse)

    expect(first).toMatchObject({ ok: true, reused: false })
    expect(again).toMatchObject({ ok: true, reused: true })
    if (first.ok && again.ok) expect(again.jobId).toBe(first.jobId)
  })
})
```

В `apps/web/tests/integration/check-jobs.test.ts` удалить тест
`refuses uploads while photographs are switched off, before starting anything`: теперь это
поведение описано тестами выше.

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm run test:integration -- tests/integration/check-jobs-photos.test.ts`
Expected: FAIL (`bad_request` «Загрузка фотографий пока недоступна» даже на валидные фото)

- [ ] **Шаг 3: `photo-attach.ts`**

Создать `apps/web/src/server/uploads/photo-attach.ts`:

```ts
import 'server-only'

import type { ErrorCode } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import type { AnalysisPhoto } from '@/server/symptom-check/analyze-symptom-check'
import { PHOTO_BUCKET, removeUploads } from '@/server/uploads/photo-storage'
import { verifyPhoto } from '@/server/uploads/photo-verify'

type SupabaseService = ReturnType<typeof createServiceClient>

export type ClaimedUpload = { id: string; object_path: string }

export type LoadedPhotos =
  | { ok: true; photos: AnalysisPhoto[]; uploads: ClaimedUpload[] }
  | { ok: false; code: ErrorCode; message: string }

/**
 * Turns upload ids into photos an analysis can be given (stage 6/02).
 *
 * Runs before anything is charged: a missing, foreign, expired or fake photo
 * refuses the check while no job and no credit exist. The bytes checked here
 * are the bytes the AI receives — they are never fetched again by URL — so
 * nothing written to storage after the check can change what was analysed.
 *
 * Once claimed, an upload belongs to this check alone. If it cannot be used,
 * it is removed on the spot: the phone uploads afresh on its next try.
 */
export async function loadPhotosForCheck(
  supabase: SupabaseService,
  userId: string,
  uploadIds: string[],
): Promise<LoadedPhotos> {
  const { data, error } = await supabase.rpc('claim_photo_uploads', {
    p_user_id: userId,
    p_ids: uploadIds,
  })
  if (error) {
    if (error.message.includes('uploads_unavailable')) {
      return { ok: false, code: 'bad_request', message: 'Фото устарели или недоступны, загрузите их заново' }
    }
    console.error('[photo-uploads] claim_failed')
    return { ok: false, code: 'internal_error', message: 'Не удалось принять фото' }
  }

  const uploads = (data ?? []) as ClaimedUpload[]
  const photos: AnalysisPhoto[] = []
  for (const upload of uploads) {
    const { data: file, error: downloadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .download(upload.object_path)
    if (downloadError || !file) {
      await removeUploads(supabase, uploads)
      return { ok: false, code: 'bad_request', message: 'Фото не догрузилось, отправьте его ещё раз' }
    }

    const verdict = verifyPhoto(new Uint8Array(await file.arrayBuffer()))
    if (!verdict.ok) {
      await removeUploads(supabase, uploads)
      return { ok: false, code: verdict.code, message: verdict.message }
    }
    photos.push(verdict.photo)
  }

  return { ok: true, photos, uploads }
}
```

- [ ] **Шаг 4: `createCheckJob`**

В `apps/web/src/server/checks/check-job-service.ts`:

1. В шапке комментария заменить предложение про отложенные фотографии на:
   `Photos arrive as upload ids: they are claimed and checked before a job or a credit exists, and removed as soon as the analysis is over.`
2. Добавить импорты:

```ts
import { loadPhotosForCheck, type ClaimedUpload } from '@/server/uploads/photo-attach'
import { removeUploads } from '@/server/uploads/photo-storage'
import type { AnalysisPhoto } from '@/server/symptom-check/analyze-symptom-check'
```

3. Удалить блок `if (input.upload_ids.length > 0) { return { ... 'Загрузка фотографий пока недоступна' } }`.
4. Сразу **после** блока `if (input.idempotencyKey) { ... existing ... }` вставить:

```ts
  let photos: AnalysisPhoto[] = []
  let uploads: ClaimedUpload[] = []
  if (input.upload_ids.length > 0) {
    const loaded = await loadPhotosForCheck(supabase, input.userId, input.upload_ids)
    if (!loaded.ok) {
      // A repeat that raced its own first attempt finds the uploads taken by
      // that attempt. It is the same request, so it gets the same job.
      if (input.idempotencyKey) {
        const existing = await findByIdempotencyKey(supabase, input.userId, input.idempotencyKey)
        if (existing) return { ok: true, jobId: existing, reused: true }
      }
      return loaded
    }
    photos = loaded.photos
    uploads = loaded.uploads
  }
```

5. Всё от `const { data: created, error: insertError } = await supabase.from('check_jobs')...`
   до конца функции обернуть в `try { ... } finally { await removeUploads(supabase, uploads) }`.
   `photos: []` в вызове `analyse` заменить на `photos`. Тогда фото удаляются при любом исходе:
   при ошибке вставки задачи, при повторе с тем же ключом, при успехе и при отказе анализа.

- [ ] **Шаг 5: Прогнать тесты**

Run: `npm run test:integration -- tests/integration/check-jobs-photos.test.ts tests/integration/check-jobs.test.ts`
Expected: PASS

Run: `npm test --workspace @lapka/web && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web/src/server apps/web/tests/integration
git commit -m "Checks take up to three uploaded photos, verify them before charging, and delete them after"
```

---

### Задача 7. Удаление аккаунта стирает фото первым шагом

**Файлы:**
- Изменить: `apps/web/src/server/account/deletion-worker.ts:29-35, 37-49, 66-78, 93-124`
- Изменить: `apps/web/tests/server/account/deletion-worker.test.ts`
- Тесты: `apps/web/tests/integration/deletion-photos.test.ts`

**Интерфейсы:**
- `DeletionStep = 'photos' | 'data' | 'auth'`
- `DeletionErrorCode` получает `'photos_step_failed'`
- `DeletionWorkerDeps.deletePhotos(userId: string): Promise<void>`. Реальная реализация вызывает
  `removeUserPhotos` из задачи 4.

- [ ] **Шаг 1: Написать падающие unit-тесты**

В `apps/web/tests/server/account/deletion-worker.test.ts` добавить `deletePhotos: vi.fn(async () => {})`
в фабрику фейковых зависимостей, если она там есть. Если её нет, добавить во все объекты deps.
Затем добавить тесты:

```ts
  it('removes photos before the data and the Auth user', async () => {
    const order: string[] = []
    const deps = fakeDeps({
      deletePhotos: vi.fn(async () => { order.push('photos') }),
      deleteAccountData: vi.fn(async () => { order.push('data') }),
      deleteAuthUser: vi.fn(async () => { order.push('auth'); return 'deleted' as const }),
    })

    await expect(processDeletionJob(deps, USER)).resolves.toBe('completed')
    expect(order).toEqual(['photos', 'data', 'auth'])
    expect(deps.markStep).toHaveBeenCalledWith(USER, 'photos')
  })

  it('does not repeat the photos step once it is recorded', async () => {
    const deps = fakeDeps({ claim: vi.fn(async () => ({ photos: '2026-09-23T10:00:00Z' })) })
    await processDeletionJob(deps, USER)
    expect(deps.deletePhotos).not.toHaveBeenCalled()
  })

  it('counts a Storage failure against the job and goes no further', async () => {
    const deps = fakeDeps({ deletePhotos: vi.fn(async () => { throw new Error('storage down') }) })
    await expect(processDeletionJob(deps, USER)).resolves.toBe('retry')
    expect(deps.recordFailure).toHaveBeenCalledWith(USER, 'photos_step_failed')
    expect(deps.deleteAccountData).not.toHaveBeenCalled()
  })
```

Имена `fakeDeps` и `USER` взять из существующего файла. Если там они называются иначе, в новых
тестах использовать те же имена, что и в файле.

- [ ] **Шаг 2: Интеграционный тест на настоящем Storage**

Создать `apps/web/tests/integration/deletion-photos.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'
import { createDeletionWorkerDeps } from '@/server/account/deletion-worker'
import { PHOTO_BUCKET, grantUploads } from '@/server/uploads/photo-storage'

/** Stage 8/08 for the one bucket that holds user files: gone before the Auth user. */

let db: Client
let seeded: SeededFixtures

function service(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  seeded = await seedFixtures(db)
  await service().storage.emptyBucket(PHOTO_BUCKET)
  await db.query('truncate table public.photo_uploads')
})

afterAll(async () => {
  await db?.end()
})

describe('deleting an account with photos', () => {
  it('leaves no object of that person in the bucket, and keeps the other person’s', async () => {
    for (const owner of [seeded.ownerAId, seeded.ownerBId]) {
      const grant = await grantUploads(service() as never, owner, [{ content_type: 'image/jpeg', size_bytes: 4 }])
      await fetch(grant!.uploads[0].url, { method: 'PUT', headers: grant!.uploads[0].headers, body: new Uint8Array(4) })
    }

    await createDeletionWorkerDeps(service() as never).deletePhotos(seeded.ownerAId)

    const { rows } = await db.query(
      `select name from storage.objects where bucket_id = $1`,
      [PHOTO_BUCKET],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].name.startsWith(`${seeded.ownerBId}/`)).toBe(true)
  })

  it('is safe to run again when nothing is left', async () => {
    const deps = createDeletionWorkerDeps(service() as never)
    await deps.deletePhotos(seeded.ownerAId)
    await expect(deps.deletePhotos(seeded.ownerAId)).resolves.toBeUndefined()
  })
})
```

- [ ] **Шаг 3: Убедиться, что тесты падают**

Run: `npm test --workspace @lapka/web -- tests/server/account/deletion-worker.test.ts && npm run test:integration -- tests/integration/deletion-photos.test.ts`
Expected: FAIL (`deletePhotos` не существует)

- [ ] **Шаг 4: Реализация**

В `apps/web/src/server/account/deletion-worker.ts`:

```ts
export type DeletionStep = 'photos' | 'data' | 'auth'
export type DeletionErrorCode =
  | 'claim_failed'
  | 'photos_step_failed'
  | 'data_step_failed'
  | 'auth_step_failed'
  | 'complete_step_failed'
```

В `DeletionWorkerDeps` перед `deleteAccountData` добавить:

```ts
  /** Every photo under the person's folder. Storage is not in the data transaction. */
  deletePhotos(userId: string): Promise<void>
```

В `processDeletionJob` блок `try` начать так:

```ts
  let code: DeletionErrorCode = 'photos_step_failed'
  try {
    if (!('photos' in progress)) {
      await deps.deletePhotos(userId)
      await deps.markStep(userId, 'photos')
    }

    code = 'data_step_failed'
    if (!('data' in progress)) {
```

Остальные шаги не меняются.

В `createDeletionWorkerDeps` добавить `deletePhotos: (userId) => removeUserPhotos(supabase, userId),`
и импорт `import { removeUserPhotos } from '@/server/uploads/photo-storage'`. В шапке
комментария модуля перечислить шаги в новом порядке: photos, data, Auth.

- [ ] **Шаг 5: Прогнать тесты**

Run: `npm test --workspace @lapka/web && npm run test:integration -- tests/integration/deletion-photos.test.ts tests/integration/deletion-worker-sql.test.ts`
Expected: PASS

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web/src/server/account/deletion-worker.ts apps/web/tests
git commit -m "Account deletion removes the person's photos from Storage before anything else"
```

---

### Задача 8. Ночная уборка брошенных загрузок

**Файлы:**
- Создать: `apps/web/src/app/(backend)/api/cron/photo-uploads/route.ts`
- Изменить: `vercel.json` (`crons`)
- Тесты: `apps/web/tests/integration/photo-sweep-route.test.ts`

**Интерфейсы:**
- Использует: `isCronAuthorized` из `@/server/account/deletion-cron`, `sweepExpiredUploads` из задачи 4.
- Отдаёт: `GET /api/cron/photo-uploads` → `{ removed: number }`, `401` без секрета, `500` при сбое.

- [ ] **Шаг 1: Написать падающий тест**

Создать `apps/web/tests/integration/photo-sweep-route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import type { Client } from 'pg'
import { GET as sweep } from '@/app/(backend)/api/cron/photo-uploads/route'
import { connect } from './fixtures'

let db: Client

beforeAll(async () => {
  db = await connect()
  process.env.CRON_SECRET = 'test-cron-secret'
})

afterAll(async () => {
  await db?.end()
})

describe('GET /api/cron/photo-uploads', () => {
  it('refuses a caller without the cron secret', async () => {
    const response = await sweep(new NextRequest('http://test.local/api/cron/photo-uploads'))
    expect(response.status).toBe(401)
  })

  it('answers with a count and nothing else', async () => {
    const response = await sweep(
      new NextRequest('http://test.local/api/cron/photo-uploads', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    )
    expect(response.status).toBe(200)
    expect(Object.keys(await response.json())).toEqual(['removed'])
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Run: `npm run test:integration -- tests/integration/photo-sweep-route.test.ts`
Expected: FAIL (маршрута нет)

- [ ] **Шаг 3: Маршрут и расписание**

Создать `apps/web/src/app/(backend)/api/cron/photo-uploads/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { isCronAuthorized } from '@/server/account/deletion-cron'
import { sweepExpiredUploads } from '@/server/uploads/photo-storage'

/**
 * Daily removal of photos that were uploaded and never attached to a check
 * (stage 6/03). Attached photos are removed by the check itself; this only
 * catches the abandoned ones. Answers a count — no ids, no paths.
 */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const removed = await sweepExpiredUploads(createServiceClient())
    return NextResponse.json({ removed }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[photo-uploads] sweep failed')
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}
```

В `vercel.json` дописать в `crons`:

```json
    { "path": "/api/cron/photo-uploads", "schedule": "30 3 * * *" }
```

- [ ] **Шаг 4: Прогнать тесты**

Run: `npm run test:integration -- tests/integration/photo-sweep-route.test.ts && npm test --workspace @lapka/web`
Expected: PASS

- [ ] **Шаг 5: Коммит**

```bash
git add "apps/web/src/app/(backend)/api/cron/photo-uploads" vercel.json apps/web/tests/integration/photo-sweep-route.test.ts
git commit -m "Nightly cron sweeps photo uploads that were never attached to a check"
```

---

### Задача 9. Телефон: подготовка и отправка фото (логика)

**Файлы:**
- Изменить: `apps/mobile/package.json`, `apps/mobile/app.json`
- Создать: `apps/mobile/src/features/checks/photos.ts`, `apps/mobile/src/features/checks/photo-upload.ts`
- Создать: `apps/mobile/src/lib/photo-io.ts` (единственный файл с нативными вызовами)
- Изменить: `apps/mobile/src/features/checks/check-form.ts:61-93` (`formToCheckInput` принимает `uploadIds`)
- Тесты: `apps/mobile/src/features/checks/photos.test.ts`, `apps/mobile/src/features/checks/photo-upload.test.ts`

**Интерфейсы:**
- `type PickedPhoto = { uri: string; width: number; height: number }`
- `type PreparedPhoto = { uri: string; size: number; contentType: 'image/jpeg' }`
- `PHOTO_LONG_SIDE = 1600`, `PHOTO_QUALITY = 0.7`
- `resizeTarget(photo: PickedPhoto): { width: number } | { height: number } | null`.
  `null` означает, что фото и так маленькое.
- `addPhotos(current: PickedPhoto[], incoming: PickedPhoto[]): PickedPhoto[]` добавляет, пока не наберётся `PHOTO_LIMITS.maxFiles`.
- `uploadPhotos(deps: UploadDeps, photos: PickedPhoto[]): Promise<string[]>` возвращает `upload_ids` в том же порядке, что и фото.
- `type UploadDeps = { prepare(p: PickedPhoto): Promise<PreparedPhoto>; requestUploads(body: UploadRequest): Promise<UploadGrant>; put(url: string, headers: Record<string, string>, file: PreparedPhoto): Promise<boolean> }`
- `class PhotoUploadError extends Error`
- `formToCheckInput(t, form, uploadIds: string[] = [])`

- [ ] **Шаг 1: Зависимости и разрешения**

Run: `cd apps/mobile && npx expo install expo-image-picker expo-image-manipulator expo-file-system`
Expected: в `apps/mobile/package.json` появились версии линии `~57`.

В `apps/mobile/app.json` в `plugins` добавить:

```json
      [
        "expo-image-picker",
        {
          "photosPermission": "Lapka shows the photos you pick to the symptom check. They are deleted right after the analysis.",
          "cameraPermission": "Lapka uses the camera to photograph your pet's symptom for the check. Photos are deleted right after the analysis.",
          "microphonePermission": false
        }
      ]
```

Run: `cd apps/mobile && npx expo config --type introspect | grep -A1 -E "NSCameraUsageDescription|NSPhotoLibraryUsageDescription"`
Expected: обе строки на месте.

- [ ] **Шаг 2: Написать падающие тесты**

Создать `apps/mobile/src/features/checks/photos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addPhotos, resizeTarget } from './photos'

const photo = (n: number, width = 4032, height = 3024) => ({ uri: `file:///p${n}.heic`, width, height })

describe('resizeTarget', () => {
  it('brings the long side of a landscape photo down to 1600', () => {
    expect(resizeTarget(photo(1, 4032, 3024))).toEqual({ width: 1600 })
  })

  it('brings the long side of a portrait photo down to 1600', () => {
    expect(resizeTarget(photo(1, 3024, 4032))).toEqual({ height: 1600 })
  })

  it('leaves a small photo alone', () => {
    expect(resizeTarget(photo(1, 1200, 900))).toBeNull()
  })
})

describe('addPhotos', () => {
  it('stops at three, keeping the ones already there', () => {
    expect(addPhotos([photo(1), photo(2)], [photo(3), photo(4)]).map((p) => p.uri)).toEqual([
      'file:///p1.heic',
      'file:///p2.heic',
      'file:///p3.heic',
    ])
  })
})
```

Создать `apps/mobile/src/features/checks/photo-upload.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { UploadGrant } from '@lapka/contracts'
import { PhotoUploadError, uploadPhotos, type UploadDeps } from './photo-upload'

const picked = (n: number) => ({ uri: `file:///p${n}.jpg`, width: 4000, height: 3000 })
const grant = (n: number): UploadGrant => ({
  uploads: Array.from({ length: n }, (_, i) => ({
    upload_id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    url: `https://storage.example/upload/${i + 1}`,
    method: 'PUT' as const,
    headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' },
    expires_at: '2026-09-23T10:15:00Z',
  })),
})

function deps(overrides: Partial<UploadDeps> = {}): UploadDeps {
  return {
    prepare: vi.fn(async (p) => ({ uri: p.uri.replace('.jpg', '-small.jpg'), size: 400_000, contentType: 'image/jpeg' as const })),
    requestUploads: vi.fn(async (body) => grant(body.files.length)),
    put: vi.fn(async () => true),
    ...overrides,
  }
}

describe('uploadPhotos', () => {
  it('asks for one grant per photo with the prepared size, and writes each to its own URL', async () => {
    const d = deps()
    const ids = await uploadPhotos(d, [picked(1), picked(2)])

    expect(d.requestUploads).toHaveBeenCalledWith({
      files: [
        { content_type: 'image/jpeg', size_bytes: 400_000 },
        { content_type: 'image/jpeg', size_bytes: 400_000 },
      ],
    })
    expect(vi.mocked(d.put).mock.calls.map(([url, , file]) => [url, file.uri])).toEqual([
      ['https://storage.example/upload/1', 'file:///p1-small.jpg'],
      ['https://storage.example/upload/2', 'file:///p2-small.jpg'],
    ])
    expect(ids).toEqual(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'])
  })

  it('asks for nothing when there are no photos', async () => {
    const d = deps()
    expect(await uploadPhotos(d, [])).toEqual([])
    expect(d.requestUploads).not.toHaveBeenCalled()
  })

  it('fails as a whole when one file does not get through', async () => {
    const d = deps({ put: vi.fn(async (url: string) => !url.endsWith('/2')) })
    await expect(uploadPhotos(d, [picked(1), picked(2)])).rejects.toBeInstanceOf(PhotoUploadError)
  })
})
```

- [ ] **Шаг 3: Убедиться, что тесты падают**

Run: `npm test --workspace @lapka/mobile -- src/features/checks/photos.test.ts src/features/checks/photo-upload.test.ts`
Expected: FAIL (модулей нет)

- [ ] **Шаг 4: Реализация логики**

Создать `apps/mobile/src/features/checks/photos.ts`:

```ts
import { PHOTO_LIMITS } from '@lapka/contracts'

/**
 * Photos attached to a check, before they are sent.
 *
 * Nothing here touches the file system: the native half lives in
 * `lib/photo-io.ts`, so this stays testable in plain Node.
 */

export type PickedPhoto = { uri: string; width: number; height: number }
export type PreparedPhoto = { uri: string; size: number; contentType: 'image/jpeg' }

/**
 * A phone photo is 12 MP or more. The AI provider scales everything down to
 * 2048 anyway; 1600 keeps what matters for a wound or an eye at roughly half a
 * megabyte, so three of them upload quickly on a weak connection.
 */
export const PHOTO_LONG_SIDE = 1600
export const PHOTO_QUALITY = 0.7

export function resizeTarget(photo: PickedPhoto): { width: number } | { height: number } | null {
  if (Math.max(photo.width, photo.height) <= PHOTO_LONG_SIDE) return null
  return photo.width >= photo.height ? { width: PHOTO_LONG_SIDE } : { height: PHOTO_LONG_SIDE }
}

export function addPhotos(current: PickedPhoto[], incoming: PickedPhoto[]): PickedPhoto[] {
  return [...current, ...incoming].slice(0, PHOTO_LIMITS.maxFiles)
}
```

Создать `apps/mobile/src/features/checks/photo-upload.ts`:

```ts
import type { UploadGrant, UploadRequest } from '@lapka/contracts'
import type { PickedPhoto, PreparedPhoto } from './photos'

/**
 * Sending photos: ask the server where, then write each file there directly.
 *
 * The server never sees the bytes on the way in — its host refuses bodies over
 * 4.5 MB — so this is two steps, and a check is only created once both are done.
 */

export type UploadDeps = {
  prepare(photo: PickedPhoto): Promise<PreparedPhoto>
  requestUploads(body: UploadRequest): Promise<UploadGrant>
  /** @returns whether storage accepted the file. */
  put(url: string, headers: Record<string, string>, file: PreparedPhoto): Promise<boolean>
}

/** A photo did not reach storage. Nothing was charged; sending again uploads afresh. */
export class PhotoUploadError extends Error {
  constructor() {
    super('Photo upload failed')
    this.name = 'PhotoUploadError'
  }
}

/** @returns upload ids, in the order of `photos`. */
export async function uploadPhotos(deps: UploadDeps, photos: PickedPhoto[]): Promise<string[]> {
  if (photos.length === 0) return []

  const prepared = await Promise.all(photos.map((photo) => deps.prepare(photo)))
  const grant = await deps.requestUploads({
    files: prepared.map((file) => ({ content_type: file.contentType, size_bytes: file.size })),
  })

  const results = await Promise.all(
    grant.uploads.map((upload, i) => deps.put(upload.url, upload.headers, prepared[i])),
  )
  if (results.some((ok) => !ok)) throw new PhotoUploadError()

  return grant.uploads.map((upload) => upload.upload_id)
}
```

В `apps/mobile/src/features/checks/check-form.ts` поменять сигнатуру на
`export function formToCheckInput(t: Dictionary, form: CheckForm, uploadIds: string[] = []): CheckFormResult`
и `upload_ids: []` на `upload_ids: uploadIds`. Существующие тесты при этом не меняются.

- [ ] **Шаг 5: Нативная половина**

Прочитать `apps/mobile/node_modules/expo-image-manipulator/build/index.d.ts` (если пакет
поднят в корень, то `node_modules/expo-image-manipulator/...`) и `expo-file-system/build/index.d.ts`.
Затем сверить имена с кодом ниже: в SDK 57 это `ImageManipulator.manipulate`, `renderAsync`,
`saveAsync`, `SaveFormat`, `File`. Создать `apps/mobile/src/lib/photo-io.ts`:

```ts
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { File } from 'expo-file-system'
import { fetch } from 'expo/fetch'
import {
  PHOTO_QUALITY,
  resizeTarget,
  type PickedPhoto,
  type PreparedPhoto,
} from '@/features/checks/photos'

/**
 * The native half of sending photos. Always re-encodes to JPEG: that is what
 * turns an iPhone's HEIC into something the server and the AI can read, and
 * what drops EXIF — including where the photo was taken.
 */
export async function preparePhoto(photo: PickedPhoto): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(photo.uri)
  const target = resizeTarget(photo)
  if (target) context.resize(target)
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY })
  return { uri: saved.uri, size: new File(saved.uri).size, contentType: 'image/jpeg' }
}

export async function putPhoto(
  url: string,
  headers: Record<string, string>,
  file: PreparedPhoto,
): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'PUT', headers, body: new File(file.uri) })
    return response.ok
  } catch {
    return false
  }
}
```

Если в SDK 57 `File` нельзя передать телом `expo/fetch`, заменить тело на
`await new File(file.uri).bytes()`. Как именно получилось, записать в отчёт (задача 10).

- [ ] **Шаг 6: Прогнать тесты**

Run: `npm test --workspace @lapka/mobile && npm run typecheck --workspace @lapka/mobile`
Expected: PASS

- [ ] **Шаг 7: Коммит**

```bash
git add apps/mobile package-lock.json
git commit -m "Mobile: shrink photos to JPEG and send them straight to storage before the check"
```

---

### Задача 10. Телефон: фото в форме, документы, проверка вживую, отчёт

**Файлы:**
- Создать: `apps/mobile/src/ui/PhotoStrip.tsx`
- Изменить: `apps/mobile/src/ui/Icon.tsx` (иконка `camera` из `docs/design/mobile-concept-v1/screens.js:9`)
- Изменить: `apps/mobile/src/i18n/ru.ts`, `apps/mobile/src/i18n/en.ts` (раздел `check` и `errors`)
- Изменить: `apps/mobile/src/lib/errors.ts` (`PhotoUploadError` → `t.errors.photoUploadFailed`)
- Изменить: `apps/mobile/app/(tabs)/check/index.tsx` (шаг 1 и `submit`)
- Изменить: `docs/photos-next-version.md`, `docs/mobile-api-plan.md`,
  `docs/architecture/jobs-uploads-deletion.md` §3, `docs/design/mobile-design-spec.md:887-901`,
  `docs/verification/OPEN_QUESTIONS.md` (3.7, 3.12)
- Создать: `docs/verification/stage-6-photos.md`

**Интерфейсы:**
- `PhotoStrip({ photos, onAdd, onRemove, t }: { photos: PickedPhoto[]; onAdd(source: 'camera' | 'library'): void; onRemove(index: number): void; t: Dictionary })`

- [ ] **Шаг 1: Строки и ошибка**

В `ru.ts`, раздел `check`, добавить:

```ts
    photos: 'Фото — необязательно',
    photosHint: 'До трёх фото. Они не сохраняются: удаляются сразу после анализа.',
    addPhoto: 'Добавить фото',
    removePhoto: 'Убрать фото',
    takePhoto: 'Снять фото',
    fromLibrary: 'Из галереи',
    uploadingPhotos: 'Отправляем фото',
```

Раздел `errors`: `photoUploadFailed: 'Фото не отправились. Проверьте связь и попробуйте ещё раз — проверка не списана.'`

В `en.ts` те же ключи: `'Photos — optional'`,
`'Up to three photos. They are not kept: deleted right after the analysis.'`, `'Add a photo'`,
`'Remove photo'`, `'Take a photo'`, `'From library'`, `'Sending photos'`, а в `errors`
`'The photos did not go through. Check the connection and try again — no check was used.'`.

В `apps/mobile/src/lib/errors.ts` функция `errorMessage` должна возвращать
`t.errors.photoUploadFailed`, если `cause instanceof PhotoUploadError`. Проверку поставить перед
разбором `ApiError`. Добавить тест в `apps/mobile/src/lib/errors.test.ts`, если файл существует,
иначе создать его:

```ts
import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import { errorMessage } from './errors'
import { PhotoUploadError } from '@/features/checks/photo-upload'

describe('errorMessage', () => {
  it('says a photo did not go through, and that nothing was charged', () => {
    expect(errorMessage(ru, new PhotoUploadError(), 'fallback')).toBe(ru.errors.photoUploadFailed)
  })
})
```

Run: `npm test --workspace @lapka/mobile`
Expected: PASS. Среди прочих проходит `i18n.test.ts`: ключи совпадают, английские строки не
остались русскими.

- [ ] **Шаг 2: Компонент и экран**

`PhotoStrip` сделать по §6.20 спеки дизайна:
- превью 72×72 с радиусом 12 и крестиком. У крестика `IconButton` с зоной нажатия 44×44 и
  `accessibilityLabel={t.check.removePhoto}`;
- плитка добавления 72×72, пунктирная рамка `colour.hairline`, иконка `camera`, исчезает после
  третьего фото;
- по нажатию на плитку `OptionSheet` с вариантами `t.check.takePhoto` и `t.check.fromLibrary`;
- над полосой подпись `t.check.photos`, под ней `t.check.photosHint`.

В `apps/mobile/app/(tabs)/check/index.tsx`:
- состояние `const [photos, setPhotos] = useState<PickedPhoto[]>([])`. В черновик фото не
  попадают: URI из кеша не переживают перезапуск, а черновик хранится в keychain;
- `const uploaded = useRef<{ key: string; ids: string[] } | null>(null)`;
- `startFresh` сбрасывает `photos` и `uploaded.current`;
- выбор фото:

```ts
  async function pickPhotos(source: 'camera' | 'library') {
    const left = PHOTO_LIMITS.maxFiles - photos.length
    if (left <= 0) return
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
    // A refusal is an answer, not an error: the check works without photos.
    if (!permission.granted) return
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: left,
            quality: 1,
          })
    if (result.canceled) return
    setPhotos((current) =>
      addPhotos(current, result.assets.map(({ uri, width, height }) => ({ uri, width, height }))),
    )
  }
```

- в `submit()` после `key.current ??= newIdempotencyKey()` и `setWaiting(true)`, внутри `try`,
  перед `createCheck`:

```ts
      if (photos.length > 0 && uploaded.current?.key !== key.current) {
        const ids = await withFreshSession((api) =>
          uploadPhotos({ prepare: preparePhoto, requestUploads: api.requestUploads, put: putPhoto }, photos),
        )
        uploaded.current = { key: key.current!, ids }
      }
      const input = formToCheckInput(t, form, uploaded.current?.ids ?? [])
```

  Существующий расчёт `input` в начале `submit` оставить: он проверяет текст до отправки. Ниже
  использовать новый `input`, а старый переименовать в `checked`;
- в `catch` функции `submit`: если `cause instanceof ApiError`, сбросить `uploaded.current = null`,
  потому что сервер уже удалил или отверг эти загрузки. При таймауте ничего не сбрасывать: повтор с
  тем же ключом и теми же ids вернёт уже созданную задачу;
- на шаге 1 вставить `<PhotoStrip ... />` между `Field` симптомов и `Banner`;
- в `SummaryCard` на шаге 2 показать число фото, если оно не ноль.

Run: `npm run typecheck --workspace @lapka/mobile && npm test --workspace @lapka/mobile`
Expected: PASS

- [ ] **Шаг 3: Проверка вживую на симуляторе против локального сервера**

Нативные модули новые, поэтому нужна новая сборка:
`cd apps/mobile && npx expo run:ios`. Перед этим открыть панель симулятора (`attach`). Сервер
поднять командой `npm run dev:staging`, но только **после** того, как владелец разрешит
применить миграцию к staging (шаг 4). До этого гонять всё против локального Supabase по рецепту
из памяти «Expo dev: .env.local beats shell env».

Пройти и записать результат каждого пункта:
1. Галерея симулятора, 1 фото → проверка завершилась, в результате есть «Что видно на фото».
2. 3 фото → четвёртое добавить нельзя, плитка исчезла.
3. Отказ в доступе к галерее → форма работает, отправляется без фото.
4. Сеть выключена во время отправки фото → сообщение `photoUploadFailed`, кредит на месте.
   Проверить через `select credits from profiles`.
5. После каждой проверки: `select count(*) from storage.objects where bucket_id = 'check-photos'`
   → `0`.

Камеры на симуляторе нет: сценарий «снять фото» проверяется на устройстве (см. память «iPhone
device setup for apps/mobile»). Если устройства под рукой нет, пункт остаётся открытым, так и
написать в отчёте.

- [ ] **Шаг 4: Staging, только с согласия владельца**

Спросить владельца. Если он согласился: `supabase db push` для проекта staging, затем повторить
шаг 3 против `dev:staging`. Отдельно проверить на hosted Storage, что `PUT` по гранту проходит без
`apikey` (см. задачу 4, шаг 4). В production ничего не применять до слияния ветки.

- [ ] **Шаг 5: Документы**

- `docs/photos-next-version.md`: в начало добавить абзац «Возвращены в работу 23 сентября 2026
  решением владельца, план — [stage-6-photos.md](superpowers/plans/stage-6-photos.md)». В таблице
  «Что тянется за этим решением» обновить строки про `/uploads`, приватное хранилище, разрешения
  камеры и 8/08.
- `docs/mobile-api-plan.md`: в строку порядка выполнения и в раздел этапа 6 внести то же решение
  с датой.
- `docs/architecture/jobs-uploads-deletion.md` §3: заменить три **БЛОКЕР** значениями из раздела
  «Решения» этого плана. Количество файлов «1–3», типы jpeg/png/webp.
- `docs/design/mobile-design-spec.md` §6.20: «пяти» → «трёх», «после пятого» → «после третьего».
- `docs/verification/OPEN_QUESTIONS.md`: 3.7 и 3.12 в части `/uploads` зачеркнуть и пометить
  «сделано» со ссылкой на отчёт. Пункт 0.1 оставить закрытым, но дописать, что фото вернулись
  через Storage, в обход лимита.
- Материалы для магазина (11/02): у приложения теперь есть разрешения камеры и галереи.
  Дописать это в раздел 11/02 плана как новый открытый пункт.

- [ ] **Шаг 6: Отчёт**

Создать `docs/verification/stage-6-photos.md` по `docs/verification/REPORT_TEMPLATE.md`. Для
каждого критерия приёмки 6/01, 6/02, 6/03 и затронутого 8/08 указать тест или ручной шаг и
результат. Отдельно указать, что проверено только локально, что на staging, и что осталось
открытым (камера на устройстве, Android).

- [ ] **Шаг 7: Полный прогон и коммит**

Run: `npm run lint && npm run typecheck && npm test && npm run test:integration && npm test --workspace @lapka/mobile`
Expected: PASS

```bash
git add apps/mobile docs
git commit -m "Mobile: attach up to three photos to a check; stage 6 photo report and docs"
```
