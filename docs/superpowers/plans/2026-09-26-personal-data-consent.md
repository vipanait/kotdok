# Personal Data Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a separate, versioned consent to personal-data processing at sign-up on web and mobile, gate new accounts that have none, and publish the privacy policy and consent texts.

**Architecture:** A `personal_data_consents` table plus a `profiles.pd_consent_required` flag (false for every existing row). Email sign-up records consent through sign-up metadata in `handle_new_user`; provider sign-ups record it through a short-lived cookie (web callback) or a pending call (mobile). `loadAccount` computes `pdConsentRequired`; `withApiAuth`, the cookie routes and the cabinet refuse or redirect on it; `/consent` (web) and `app/consent.tsx` (mobile) collect it.

**Tech Stack:** Supabase Postgres migrations, Next.js (`apps/web`, read `node_modules/next/dist/docs/` before touching routing), zod contracts (`packages/contracts`), shared API client (`packages/shared`), Expo Router (`apps/mobile`), vitest (unit + integration against local Supabase).

**Spec:** `docs/superpowers/specs/2026-09-26-personal-data-consent-design.md`

## Global Constraints

- Current edition: `PD_CONSENT_VERSION = '2026-09-26'`; the database accepts exactly that string via `public.pd_consent_version_is_current(text)`.
- Allowed `source` values: `'web' | 'ios' | 'android'`.
- New error code `consent_required`, HTTP 403; never renamed.
- `PublicProfileSchema` / `/api/v1/me` do not change.
- Existing accounts never see the consent screen: migration leaves every existing `profiles` row at `pd_consent_required = false`.
- Web provider cookie: name `lapka_pd_consent`, value = version, `SameSite=Lax`, `Max-Age=900`, `Path=/auth/callback`.
- Texts are Russian only; operator is «Администрация Сервиса»; contact `support@lapka.my`; recipients named (Supabase, Vercel, OpenAI, Yandex/Google/Apple, Expo), countries not named.
- Routes: `/legal` (agreement), `/legal/privacy` (policy), `/legal/personal-data` (consent), `/consent` (gate).
- Only one checkbox — for consent. The agreement is accepted by the button, with a line under it.
- `packages/*` stay portable: no Next.js, no server SDKs, no DOM.
- Never `supabase config push`; the owner runs `supabase db push` before merge.

## Review Focus

1. A brand-new account created via Yandex from `/login` must land on `/consent`, not in the cabinet — pinned in Task 4 (cabinet state) and Task 7 (manual).
2. A crafted or stale `lapka_pd_consent` cookie (wrong version, garbage) must not record consent — pinned in Task 5.
3. Garbage `pd_consent` sign-up metadata (string, wrong version, wrong source, nested nonsense) must not break sign-up — pinned in Task 1.
4. An account without consent must still reach `/api/v1/me`, `/api/v1/consent`, account deletion and reauth — pinned in Task 3.
5. Existing integration fixtures (fresh users) must not start failing with `consent_required` — Task 1 sets them to `false`, Task 3 runs the whole suite.

---

### Task 1: Schema — table, flag, trigger

**Files:**
- Create: `supabase/migrations/20260926120000_personal_data_consents.sql`
- Modify: `apps/web/tests/integration/fixtures.ts` (seed sets `pd_consent_required = false`)
- Test: `apps/web/tests/integration/personal-data-consents-sql.test.ts`

**Interfaces:**
- Produces: table `public.personal_data_consents(id, user_id, version, source, accepted_at)`, column `public.profiles.pd_consent_required boolean`, function `public.pd_consent_version_is_current(text) returns boolean`, `handle_new_user()` reading `raw_user_meta_data -> 'pd_consent'`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/integration/personal-data-consents-sql.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

let db: Client
let seeded: SeededFixtures

function admin() {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function createUser(email: string, metadata: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({
    email, password: 'fixture-password-1', email_confirm: true, user_metadata: metadata,
  })
  if (error) throw error
  return data.user.id
}

async function consentsOf(userId: string) {
  const { rows } = await db.query<{ version: string; source: string }>(
    `select version, source from public.personal_data_consents where user_id = $1`, [userId],
  )
  return rows
}

beforeAll(async () => { db = await connect() })
beforeEach(async () => { seeded = await seedFixtures(db) })
afterAll(async () => { await db?.end() })

describe('personal data consent schema', () => {
  it('accepts the version the code ships', async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select public.pd_consent_version_is_current($1) as ok`, [PD_CONSENT_VERSION],
    )
    expect(rows[0].ok).toBe(true)
  })

  it('rejects any other version', async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select public.pd_consent_version_is_current('2020-01-01') as ok`,
    )
    expect(rows[0].ok).toBe(false)
  })

  it('makes a new profile require consent', async () => {
    const id = await createUser('new-no-consent@example.test', {})
    const { rows } = await db.query<{ pd_consent_required: boolean }>(
      `select pd_consent_required from public.profiles where id = $1`, [id],
    )
    expect(rows[0].pd_consent_required).toBe(true)
    expect(await consentsOf(id)).toEqual([])
  })

  it('records consent from sign-up metadata', async () => {
    const id = await createUser('with-consent@example.test', {
      locale: 'ru', pd_consent: { version: PD_CONSENT_VERSION, source: 'ios' },
    })
    expect(await consentsOf(id)).toEqual([{ version: PD_CONSENT_VERSION, source: 'ios' }])
  })

  it.each([
    ['a string', 'yes'],
    ['a stale version', { version: '2020-01-01', source: 'web' }],
    ['an unknown source', { version: PD_CONSENT_VERSION, source: 'fax' }],
    ['a number version', { version: 5, source: 'web' }],
    ['an array', [1, 2]],
  ])('ignores %s without failing sign-up', async (_label, value) => {
    const id = await createUser(`junk-${Math.random().toString(36).slice(2)}@example.test`, {
      pd_consent: value,
    })
    expect(await consentsOf(id)).toEqual([])
  })

  it('keeps one row per user and version', async () => {
    await expect(
      db.query(
        `insert into public.personal_data_consents (user_id, version, source) values ($1, $2, 'web'), ($1, $2, 'web')`,
        [seeded.ownerAId, PD_CONSENT_VERSION],
      ),
    ).rejects.toThrow()
  })

  it('removes consents together with the user', async () => {
    const id = await createUser('cascade@example.test', {
      pd_consent: { version: PD_CONSENT_VERSION, source: 'web' },
    })
    await db.query(`delete from public.profiles where id = $1`, [id])
    await admin().auth.admin.deleteUser(id)
    expect(await consentsOf(id)).toEqual([])
  })

  it('is invisible to a user token', async () => {
    const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await client.auth.signInWithPassword({ email: 'owner-a@example.test', password: 'fixture-password-1' })
    const { data } = await client.from('personal_data_consents').select('id')
    expect(data ?? []).toEqual([])
  })
})
```

Before writing, check `OWNER_A.email` in `fixtures.ts` and use the constant (`OWNER_A.email`, `FIXTURE_PASSWORD`) instead of the literals above if they differ.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration --workspace @lapka/web -- personal-data-consents-sql`
Expected: FAIL — `PD_CONSENT_VERSION` is not exported yet / function does not exist. (Add the constant first in Task 2 Step 3 if the import error hides the SQL failures; the constant alone is a one-line export.)

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260926120000_personal_data_consents.sql
--
-- Consent to personal-data processing, recorded as its own act (152-FZ art. 9
-- as amended from 1 September 2025: consent is a separate document, not a
-- clause of the terms, and the operator has to be able to prove it was given).
--
-- One row per user and edition of the consent text. Rows are never edited; they
-- go away only with the user (ON DELETE CASCADE from auth.users).
--
-- `profiles.pd_consent_required` says whether the account has to give consent
-- at all. Every account that exists when this runs is left at false — the
-- owner's decision of 26 September 2026: only accounts created from now on
-- are asked. New rows default to true.

create table public.personal_data_consents (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  version     text not null,
  source      text not null check (source in ('web', 'ios', 'android')),
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);

alter table public.personal_data_consents enable row level security;
-- No policies: only the service role and SECURITY DEFINER code touch it.
revoke all on public.personal_data_consents from anon, authenticated;

alter table public.profiles add column pd_consent_required boolean not null default false;
alter table public.profiles alter column pd_consent_required set default true;

-- The editions a client may consent to. A new edition of the text replaces
-- this function in its own migration, together with PD_CONSENT_VERSION in
-- packages/contracts.
create or replace function public.pd_consent_version_is_current(v text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select v is not null and v in ('2026-09-26');
$$;

-- handle_new_user: unchanged locale rule (20260908120000), plus the consent
-- the client sent with an email sign-up. The metadata is attacker-controlled:
-- anything that is not an object with a current version and a known source is
-- ignored, and nothing here may fail the sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
  consent jsonb;
  consent_version text;
  consent_source text;
begin
  requested := lower(split_part(coalesce(new.raw_user_meta_data ->> 'locale', ''), '-', 1));
  requested := split_part(requested, '_', 1);

  insert into public.profiles (id, locale)
  values (new.id, case when requested = 'ru' then 'ru' else 'en' end);

  consent := new.raw_user_meta_data -> 'pd_consent';
  if consent is not null and jsonb_typeof(consent) = 'object' then
    consent_version := case when jsonb_typeof(consent -> 'version') = 'string' then consent ->> 'version' end;
    consent_source := case when jsonb_typeof(consent -> 'source') = 'string' then consent ->> 'source' end;
    if public.pd_consent_version_is_current(consent_version)
       and consent_source in ('web', 'ios', 'android') then
      insert into public.personal_data_consents (user_id, version, source)
      values (new.id, consent_version, consent_source)
      on conflict (user_id, version) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

- [ ] **Step 4: Fixtures keep representing existing accounts**

In `apps/web/tests/integration/fixtures.ts` `seedFixtures`, extend both `update public.profiles` statements with `, pd_consent_required = false`:

```ts
  await client.query(
    `update public.profiles set credits = $2, locale = $3, role = $4, pd_consent_required = false where id = $1`,
    [ownerAId, OWNER_A.expectedCredits, OWNER_A.locale, OWNER_A.role],
  )
```

(same for owner B). Comment above: `// Fixture owners stand for accounts that existed before consent was asked.`

- [ ] **Step 5: Apply and run**

Run: `npx supabase migration up --local` (or `npx supabase db reset` then `supabase stop && supabase start` — see memory about storage after reset), then
`npm run test:integration --workspace @lapka/web -- personal-data-consents-sql schema account-status`
Expected: PASS. If `schema.test.ts` enumerates tables/columns, add the new ones there.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260926120000_personal_data_consents.sql apps/web/tests/integration/
git commit -m "Consent: table, profile flag and sign-up trigger"
```

---

### Task 2: Contracts and the shared client

**Files:**
- Create: `packages/contracts/src/consent.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/errors.ts`, `packages/contracts/src/openapi.ts`, `docs/api/openapi.yaml` (regenerated), `packages/shared/src/api-client.ts`
- Test: `apps/web/tests/unit/contracts/contracts.test.ts`, `packages/shared/src/api-client.test.ts`

**Interfaces:**
- Produces:
  - `PD_CONSENT_VERSION: '2026-09-26'`
  - `ConsentSourceSchema = z.enum(['web','ios','android'])`, `type ConsentSource`
  - `ConsentStatusSchema = z.strictObject({ required: z.boolean(), version: z.string().min(1) })`, `type ConsentStatus`
  - `ConsentInputSchema = z.strictObject({ version: z.string().min(1).max(32), source: ConsentSourceSchema })`, `type ConsentInput`
  - `ERROR_CODES.consent_required`, `ERROR_STATUS.consent_required = 403`
  - api client: `getConsentStatus(): Promise<ConsentStatus>`, `giveConsent(body: ConsentInput): Promise<void>`

- [ ] **Step 1: Write the failing tests**

In `apps/web/tests/unit/contracts/contracts.test.ts` add:

```ts
import { ConsentInputSchema, ConsentStatusSchema, ERROR_STATUS, PD_CONSENT_VERSION } from '@lapka/contracts'

describe('consent contracts', () => {
  it('ships a dated edition', () => {
    expect(PD_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('accepts a known source only', () => {
    expect(ConsentInputSchema.safeParse({ version: PD_CONSENT_VERSION, source: 'ios' }).success).toBe(true)
    expect(ConsentInputSchema.safeParse({ version: PD_CONSENT_VERSION, source: 'fax' }).success).toBe(false)
    expect(ConsentInputSchema.safeParse({ version: PD_CONSENT_VERSION, source: 'web', extra: 1 }).success).toBe(false)
  })
  it('keeps the status strict', () => {
    expect(ConsentStatusSchema.safeParse({ required: true, version: PD_CONSENT_VERSION }).success).toBe(true)
    expect(ConsentStatusSchema.safeParse({ required: true, version: PD_CONSENT_VERSION, user: 'x' }).success).toBe(false)
  })
  it('serves consent_required as 403', () => {
    expect(ERROR_STATUS.consent_required).toBe(403)
  })
})
```

In `packages/shared/src/api-client.test.ts` add, following the file's existing fake-fetch helper:

```ts
it('reads the consent status and sends consent', async () => {
  // use the file's existing helper that records requests and returns canned responses
  const { client, requests } = clientWith([
    { status: 200, body: { required: true, version: '2026-09-26' } },
    { status: 204, body: null },
  ])
  await expect(client.getConsentStatus()).resolves.toEqual({ required: true, version: '2026-09-26' })
  await expect(client.giveConsent({ version: '2026-09-26', source: 'ios' })).resolves.toBeUndefined()
  expect(requests.map((r) => [r.method, r.path])).toEqual([
    ['GET', '/api/v1/consent'],
    ['POST', '/api/v1/consent'],
  ])
})
```

Adapt `clientWith`/`requests` to the helper the test file already defines (read it first); keep the assertions.

- [ ] **Step 2: Run to verify failure**

Run: `npm run test --workspace @lapka/web -- contracts` and `npx vitest run --root packages/shared`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

```ts
// packages/contracts/src/consent.ts
import { z } from 'zod'

/**
 * The edition of the consent text a client shows and sends. A new edition
 * changes this, the page at /legal/personal-data and
 * `public.pd_consent_version_is_current` together.
 */
export const PD_CONSENT_VERSION = '2026-09-26'

export const ConsentSourceSchema = z.enum(['web', 'ios', 'android'])
export type ConsentSource = z.infer<typeof ConsentSourceSchema>

/** Whether this account still has to consent, and to which edition. */
export const ConsentStatusSchema = z.strictObject({
  required: z.boolean(),
  version: z.string().min(1),
})
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>

export const ConsentInputSchema = z.strictObject({
  version: z.string().min(1).max(32),
  source: ConsentSourceSchema,
})
export type ConsentInput = z.infer<typeof ConsentInputSchema>
```

`index.ts`: add `export * from './consent'` after `./profile`.

`errors.ts`: add to `ERROR_CODES` after `account_deleting`:

```ts
  /**
   * The account has not consented to personal-data processing (or not to the
   * current edition). The client's next move is the consent screen.
   */
  consent_required: 'consent_required',
```

and `consent_required: 403,` to `ERROR_STATUS`.

`openapi.ts`:
- import `ConsentInputSchema, ConsentStatusSchema` from `./consent`;
- `COMPONENTS`: `['ConsentStatus', ConsentStatusSchema], ['ConsentInput', ConsentInputSchema],` after `ProfileUpdateInput`;
- `commonErrors`: add `'consent_required'` to the default `codes` list after `'account_deleting'`, and `consent_required: 'Consent to personal-data processing is required first'` to `descriptions`. Note both are 403: `Object.fromEntries` keyed by status would drop one. Change the builder so codes sharing a status merge into one response with `oneOf` examples — or simpler, keep `account_deleting` as the 403 entry and describe both in its description: `'Account is being deleted, or consent is required first (see error.code)'`. Take the simpler one: do **not** add `consent_required` to `codes`; change the `account_deleting` description to `'Account is being deleted, or consent to personal-data processing is required (error.code tells which)'`. Keep the `consent_required` description entry so the `Record<ErrorCode,string>` type is satisfied.
- paths, after `'/me'`:

```ts
      '/consent': {
        get: {
          summary: 'Whether the caller still has to consent to personal-data processing',
          responses: { '200': json('ConsentStatus', 'Consent status'), ...commonErrors() },
        },
        post: {
          summary: 'Record consent to the current edition',
          description: 'Repeating the call is harmless. A version other than the current edition is refused.',
          requestBody: body('ConsentInput'),
          responses: { '204': { description: 'Recorded' }, ...commonErrors('bad_request') },
        },
      },
```

`api-client.ts`, after `updateMe`:

```ts
    getConsentStatus: () => call('/consent', ConsentStatusSchema),
    giveConsent: (body: ConsentInput) => call<void>('/consent', null, { method: 'POST', body }),
```

with the imports added to the file's import list from `@lapka/contracts`.

Regenerate: `npm run openapi` (check root `package.json` for the exact script name that writes `docs/api/openapi.yaml`; `scripts/check-openapi.ts` must report no diff afterwards).

Mobile error map `apps/mobile/src/lib/errors.ts` `apiMessages` is a `Record<string,string>` — add `consent_required: t.errors.consentRequired` and the strings `consentRequired: 'Нужно согласие на обработку персональных данных'` / `'Consent to personal data processing is required'` to `apps/mobile/src/i18n/ru.ts` and `en.ts` `errors`.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test --workspace @lapka/web -- contracts openapi api-client` and `npx vitest run --root packages/shared`, `npx tsc -b` (or the root `typecheck` script)
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ docs/api/openapi.yaml apps/web/tests/unit/contracts apps/mobile/src/lib/errors.ts apps/mobile/src/i18n
git commit -m "Consent: contracts, error code and client calls"
```

---

### Task 3: Server — account rule, consent service, API enforcement

**Files:**
- Modify: `apps/web/src/server/auth/account-state.ts`, `apps/web/src/server/api/bearer-auth.ts`, `apps/web/src/server/api/with-api-auth.ts`
- Create: `apps/web/src/server/consent/consent-service.ts`, `apps/web/src/app/(backend)/api/v1/consent/route.ts`
- Modify (opt out of the consent check): `api/v1/me/route.ts`, `api/v1/account-deletion/route.ts`, `api/v1/auth/reauth/route.ts`
- Modify (cookie routes enforce): `api/pets/route.ts`, `api/pets/[id]/route.ts`, `api/feedback/route.ts`, `api/credits/request-extra/route.ts`, `api/symptom-check/route.ts`
- Test: `apps/web/tests/integration/api-consent.test.ts`; fix unit tests that build `AccountContext` literals

**Interfaces:**
- Consumes: Task 1 schema, Task 2 contracts.
- Produces:
  - `AccountContext.pdConsentRequired: boolean`
  - `consentStatus(supabase, account: AccountContext): ConsentStatus` (sync; derived)
  - `recordConsent(supabase, userId: string, input: ConsentInput): Promise<{ ok: true } | { ok: false; reason: 'stale_version' | 'failed' }>`
  - `withApiAuth(handler, options?: { consent?: 'enforce' | 'skip' })` — default `'enforce'`
  - `cookieConsentRefusal(userId: string): Promise<NextResponse | null>` in `apps/web/src/server/consent/consent-service.ts` for cookie routes

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/web/tests/integration/api-consent.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, ConsentStatusSchema, PD_CONSENT_VERSION } from '@lapka/contracts'
import { FIXTURE_PASSWORD, OWNER_A, connect, seedFixtures, type SeededFixtures } from './fixtures'

const consentRoute = await import('@/app/(backend)/api/v1/consent/route')
const meRoute = await import('@/app/(backend)/api/v1/me/route')
const petsRoute = await import('@/app/(backend)/api/v1/pets/route')

let db: Client
let seeded: SeededFixtures
let token: string

async function signIn(): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email: OWNER_A.email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(path: string, init: { method?: string; body?: unknown } = {}) {
  return new NextRequest(`http://test.local${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

async function code(response: Response) {
  return ApiErrorEnvelopeSchema.parse(await response.json()).error.code
}

async function requireConsentForOwnerA() {
  await db.query(`update public.profiles set pd_consent_required = true where id = $1`, [seeded.ownerAId])
}

beforeAll(async () => { db = await connect() })
beforeEach(async () => {
  seeded = await seedFixtures(db)
  await db.query('truncate table public.api_rate_limits')
  token = await signIn()
})
afterAll(async () => { await db?.end() })

describe('consent over the API', () => {
  it('does not ask an existing account', async () => {
    const res = await consentRoute.GET(request('/api/v1/consent'), undefined)
    expect(ConsentStatusSchema.parse(await res.json())).toEqual({ required: false, version: PD_CONSENT_VERSION })
    expect((await petsRoute.GET(request('/api/v1/pets'), undefined)).status).toBe(200)
  })

  it('refuses business routes until a new account consents', async () => {
    await requireConsentForOwnerA()
    const pets = await petsRoute.GET(request('/api/v1/pets'), undefined)
    expect(pets.status).toBe(403)
    expect(await code(pets)).toBe('consent_required')
  })

  it('still serves /me and the consent status without consent', async () => {
    await requireConsentForOwnerA()
    expect((await meRoute.GET(request('/api/v1/me'), undefined)).status).toBe(200)
    const status = await consentRoute.GET(request('/api/v1/consent'), undefined)
    expect(ConsentStatusSchema.parse(await status.json()).required).toBe(true)
  })

  it('records consent once and opens the API', async () => {
    await requireConsentForOwnerA()
    const body = { version: PD_CONSENT_VERSION, source: 'ios' }
    expect((await consentRoute.POST(request('/api/v1/consent', { method: 'POST', body }), undefined)).status).toBe(204)
    expect((await consentRoute.POST(request('/api/v1/consent', { method: 'POST', body }), undefined)).status).toBe(204)
    const { rows } = await db.query(`select source from public.personal_data_consents where user_id = $1`, [seeded.ownerAId])
    expect(rows).toEqual([{ source: 'ios' }])
    expect((await petsRoute.GET(request('/api/v1/pets'), undefined)).status).toBe(200)
  })

  it('refuses a stale edition and a malformed body', async () => {
    await requireConsentForOwnerA()
    const stale = await consentRoute.POST(
      request('/api/v1/consent', { method: 'POST', body: { version: '2020-01-01', source: 'web' } }), undefined,
    )
    expect(await code(stale)).toBe('bad_request')
    const junk = await consentRoute.POST(request('/api/v1/consent', { method: 'POST', body: { yes: true } }), undefined)
    expect(await code(junk)).toBe('bad_request')
  })
})
```

Also add one case to `account-deletion-request.test.ts` (or the file that already posts to `/api/v1/account-deletion`): with `pd_consent_required = true` the deletion request is **not** refused with `consent_required`.

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:integration --workspace @lapka/web -- api-consent`
Expected: FAIL — route module not found.

- [ ] **Step 3: Account rule**

`account-state.ts`: add to `AccountContext`

```ts
  /**
   * A new account that has not consented to the current edition of the
   * personal-data consent. Business operations wait until it has.
   */
  pdConsentRequired: boolean
```

In `loadAccount`, select `pd_consent_required` too, and after the status check:

```ts
  let pdConsentRequired = false
  if (data.pd_consent_required) {
    const { data: consent, error: consentError } = await supabase
      .from('personal_data_consents')
      .select('id')
      .eq('user_id', data.id)
      .eq('version', PD_CONSENT_VERSION)
      .limit(1)
      .maybeSingle()
    if (consentError) return { ok: false, reason: 'not_found' }
    pdConsentRequired = !consent
  }
```

(import `PD_CONSENT_VERSION` from `@lapka/contracts`; return it in `account`). Only accounts with the flag pay for the second query.

Run `npx tsc --noEmit -p apps/web` and add `pdConsentRequired: false` to every `AccountContext` literal the compiler reports in tests.

- [ ] **Step 4: Consent service**

```ts
// apps/web/src/server/consent/consent-service.ts
import 'server-only'

import { NextResponse } from 'next/server'
import { PD_CONSENT_VERSION, type ConsentInput, type ConsentStatus } from '@lapka/contracts'
import type { AccountContext } from '@/server/auth/account-state'
import { loadAccount } from '@/server/auth/account-state'
import { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

export function consentStatus(account: AccountContext): ConsentStatus {
  return { required: account.pdConsentRequired, version: PD_CONSENT_VERSION }
}

export type RecordConsentResult = { ok: true } | { ok: false; reason: 'stale_version' | 'failed' }

/**
 * Stores consent to the current edition. Only the current edition: a client
 * showing an older text has not shown what is being agreed to. Repeats are
 * harmless.
 */
export async function recordConsent(
  supabase: SupabaseService,
  userId: string,
  input: ConsentInput,
): Promise<RecordConsentResult> {
  if (input.version !== PD_CONSENT_VERSION) return { ok: false, reason: 'stale_version' }

  const { error } = await supabase
    .from('personal_data_consents')
    .upsert(
      { user_id: userId, version: input.version, source: input.source },
      { onConflict: 'user_id,version', ignoreDuplicates: true },
    )
  return error ? { ok: false, reason: 'failed' } : { ok: true }
}

/**
 * For the cookie-authenticated web routes: the same rule as `withApiAuth`,
 * answered in their own `{ error }` shape.
 */
export async function cookieConsentRefusal(userId: string): Promise<NextResponse | null> {
  const account = await loadAccount(createServiceClient(), userId)
  if (account.ok && account.account.pdConsentRequired) {
    return NextResponse.json({ error: 'Consent required' }, { status: 403 })
  }
  return null
}
```

- [ ] **Step 5: Enforcement in `withApiAuth`**

```ts
export type ApiAuthOptions = {
  /**
   * `skip` for the few routes an account must reach before it has consented:
   * its profile, the consent itself, and leaving (reauth, deletion).
   */
  consent?: 'enforce' | 'skip'
}

export function withApiAuth<T = unknown>(handler: ApiHandler<T>, options: ApiAuthOptions = {}) {
  return async (request: NextRequest, params: T): Promise<NextResponse> => {
    const requestId = newRequestId()

    const auth = await authenticateBearer(request)
    if (!auth.ok) return failureResponse(requestId, auth)

    if ((options.consent ?? 'enforce') === 'enforce' && auth.account.pdConsentRequired) {
      return apiError(requestId, 'consent_required', 'Consent to personal data processing is required')
    }
    // …unchanged try/catch
```

Pass `{ consent: 'skip' }` as the second argument in `api/v1/me/route.ts` (both `GET` and `PATCH`), `api/v1/account-deletion/route.ts` (every export), `api/v1/auth/reauth/route.ts`.

- [ ] **Step 6: v1 consent route**

```ts
// apps/web/src/app/(backend)/api/v1/consent/route.ts
import { NextRequest } from 'next/server'
import { ConsentInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { consentStatus, recordConsent } from '@/server/consent/consent-service'

export const GET = withApiAuth(
  (_request, context: ApiContext) => apiSuccess(context.requestId, consentStatus(context.account)),
  { consent: 'skip' },
)

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = ConsentInputSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const result = await recordConsent(createServiceClient(), context.account.userId, parsed.data)
  if (!result.ok) {
    return result.reason === 'stale_version'
      ? apiError(context.requestId, 'bad_request', 'Not the current edition of the consent')
      : apiError(context.requestId, 'internal_error', 'Could not record the consent')
  }
  return apiNoContent(context.requestId)
}, { consent: 'skip' })
```

- [ ] **Step 7: Cookie routes**

In each of `api/pets/route.ts`, `api/pets/[id]/route.ts`, `api/feedback/route.ts`, `api/credits/request-extra/route.ts`, `api/symptom-check/route.ts`, right after the `if (!user) return … 401` line of every exported handler:

```ts
  const refusal = await cookieConsentRefusal(user.id)
  if (refusal) return refusal
```

with `import { cookieConsentRefusal } from '@/server/consent/consent-service'`. `api/account-deletion/route.ts` is left alone on purpose. Read each file first — if a handler reads the user through something other than `getAuthUser`, put the check after that.

- [ ] **Step 8: Run**

Run: `npm run test:integration --workspace @lapka/web` (whole suite — Review Focus 5) and `npm run test --workspace @lapka/web`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "Consent: account rule, v1 consent route, API and cookie routes enforce it"
```

---

### Task 4: Web — cabinet gate, `/consent` page, cookie route

**Files:**
- Modify: `apps/web/src/server/cabinet/load-cabinet.ts`, `apps/web/src/components/cabinet/require-cabinet.ts`, `apps/web/src/proxy.ts`
- Create: `apps/web/src/app/(backend)/api/consent/route.ts`, `apps/web/src/app/(frontend)/consent/page.tsx`, `apps/web/src/features/consent/ConsentForm.tsx`, `apps/web/src/features/consent/ConsentCheckbox.tsx`
- Modify: `apps/web/src/shared/i18n/dictionaries/ru.ts`, `en.ts` (new `consent` block)
- Test: `apps/web/tests/server/cabinet/load-cabinet-consent.test.ts` (mocked), `apps/web/tests/api/consent-route.test.ts` (mocked, like `tests/api/credits-request-extra-route.test.ts`)

**Interfaces:**
- Consumes: `AccountContext.pdConsentRequired`, `recordConsent`.
- Produces: `CabinetState` member `{ kind: 'consent_required' }`; `ConsentCheckbox({ checked, onChange, invalid, errorId, inputRef })` React component reused by `AuthCard` in Task 5; dictionary `dict.consent`.

- [ ] **Step 1: Failing tests**

`tests/server/cabinet/load-cabinet-consent.test.ts`: mock `@/server/supabase/server` (`createClient` returns `{ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }) } }`) and `@/server/auth/account-state` (`loadAccount` resolves `{ ok: true, account: { userId: 'u1', status: 'active', role: 'user', locale: 'ru', credits: 1, pdConsentRequired: true } }`), then:

```ts
it('closes the cabinet to an account that has not consented', async () => {
  const { loadCabinetState } = await import('@/server/cabinet/load-cabinet')
  await expect(loadCabinetState()).resolves.toEqual({ kind: 'consent_required' })
})
```

`tests/api/consent-route.test.ts`: mock `verifyCsrf` true/false, `getAuthUser`, `recordConsent`; assert 403 without CSRF, 401 without user, 400 for `{ version: 'x' }`, 200 and `recordConsent` called with `{ version: PD_CONSENT_VERSION, source: 'web' }` for `{ version: PD_CONSENT_VERSION }`.

- [ ] **Step 2: Run — FAIL.** `npm run test --workspace @lapka/web -- load-cabinet-consent consent-route`

- [ ] **Step 3: Cabinet state and redirect**

`load-cabinet.ts`: add to the union

```ts
  /** A new account that has not consented yet: the consent page first. */
  | { kind: 'consent_required' }
```

and after the `!account.ok` block: `if (account.account.pdConsentRequired) return { kind: 'consent_required' }`.

`require-cabinet.ts`:

```ts
export async function requireCabinet(signInHref: string): Promise<CabinetUser> {
  const state = await loadCabinetState()
  if (state.kind === 'deleting') redirect('/account-deletion')
  if (state.kind === 'signed_out') redirect(signInHref)
  if (state.kind === 'consent_required') redirect(`/consent?next=${encodeURIComponent(currentPath(signInHref))}`)
  return state.cabinet
}
```

`signInHref` is `/login?next=<path>` at every call site — read two call sites to confirm, then write `currentPath` to pull `next` out of it with `new URL(signInHref, 'http://x').searchParams.get('next') ?? '/dashboard'`. `account-deletion/page.tsx` uses `loadCabinetState` directly: treat `consent_required` like `open` there (the person may leave without consenting) — adjust its `switch`/`if` accordingly.

`proxy.ts`: add `'/consent'` to `protectedPaths`.

- [ ] **Step 4: Web cookie route**

```ts
// apps/web/src/app/(backend)/api/consent/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createServiceClient } from '@/server/supabase/server'
import { recordConsent } from '@/server/consent/consent-service'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

/** The site's own twin of POST /api/v1/consent; the source is always `web`. */
const BodySchema = z.strictObject({ version: z.string().min(1).max(32) })

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const result = await recordConsent(createServiceClient(), user.id, { version: parsed.data.version, source: 'web' })
  if (!result.ok) {
    return result.reason === 'stale_version'
      ? NextResponse.json({ error: 'Stale consent edition' }, { status: 400 })
      : NextResponse.json({ error: 'Failed to record consent' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Dictionary**

`ru.ts` (and matching keys in `en.ts`; English wording in parentheses):

```ts
  consent: {
    title: 'Согласие на обработку персональных данных',            // 'Consent to personal data processing'
    lead: 'Чтобы пользоваться Лапкой, нужно ваше согласие на обработку персональных данных.',
    checkboxPrefix: 'Я даю',                                          // 'I give'
    checkboxLink: 'согласие на обработку персональных данных',        // 'consent to personal data processing'
    termsPrefix: 'Продолжая, вы принимаете',                          // 'By continuing you accept the'
    termsLink: 'пользовательское соглашение',                         // 'terms of use'
    termsAnd: 'и',                                                    // 'and the'
    policyLink: 'политику обработки персональных данных',             // 'personal data policy'
    submit: 'Продолжить',                                             // 'Continue'
    submitting: 'Сохраняем...',                                       // 'Saving...'
    errorRequired: 'Отметьте согласие, чтобы продолжить',             // 'Tick the consent to continue'
    errorFailed: 'Не удалось сохранить согласие. Попробуйте ещё раз.',// 'Could not save the consent. Try again.'
    signOut: 'Выйти',                                                 // 'Sign out'
    deleteAccount: 'Удалить аккаунт',                                 // 'Delete account'
  },
```

Remove `auth.register.tosPrefix`, `tosLink`, `errorTosRequired` in Task 5 once `AuthCard` stops using them.

- [ ] **Step 6: Components and page**

```tsx
// apps/web/src/features/consent/ConsentCheckbox.tsx
'use client'

import Link from 'next/link'
import { useId, type RefObject } from 'react'
import { useTranslations } from '@/components/LocaleProvider'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  invalid: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}

/**
 * The one checkbox: consent to personal-data processing, unticked by default,
 * with the text a click away. The terms are not ticked here — see ConsentTerms.
 */
export default function ConsentCheckbox({ checked, onChange, invalid, inputRef }: Props) {
  const t = useTranslations().consent
  const id = useId()
  const errorId = useId()
  return (
    <div className="auth-terms">
      <label className="terms" htmlFor={id}>
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        />
        <span>
          {t.checkboxPrefix}{' '}
          <Link href="/legal/personal-data" target="_blank" rel="noopener noreferrer">{t.checkboxLink}</Link>
        </span>
      </label>
      {invalid && <p id={errorId} className="field-error" role="alert">{t.errorRequired}</p>}
    </div>
  )
}

/** «Продолжая, вы принимаете соглашение и политику» — acceptance by the button. */
export function ConsentTerms() {
  const t = useTranslations().consent
  return (
    <p className="auth-terms-note">
      {t.termsPrefix}{' '}
      <Link href="/legal" target="_blank" rel="noopener noreferrer">{t.termsLink}</Link>{' '}
      {t.termsAnd}{' '}
      <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer">{t.policyLink}</Link>
    </p>
  )
}
```

Add `.auth-terms-note { margin: 12px 0 0; font-size: 13px; color: var(--muted, #6b6b6b); text-align: center; }` next to `.auth-terms` in `apps/web/src/app/styles/design-system.css` (find the existing `.auth-terms` rule and match its tokens instead of the literal colour if a muted token exists).

```tsx
// apps/web/src/features/consent/ConsentForm.tsx
'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import SignOutForm from '@/features/auth/SignOutForm'
import ConsentCheckbox, { ConsentTerms } from '@/features/consent/ConsentCheckbox'
import { csrfHeaders } from '@/shared/security/csrf-client'

export default function ConsentForm({ next }: { next: string }) {
  const router = useRouter()
  const t = useTranslations().consent
  const [checked, setChecked] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!checked) { setInvalid(true); ref.current?.focus(); return }
    setLoading(true); setError('')
    const res = await fetch('/api/consent', {
      method: 'POST',
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ version: PD_CONSENT_VERSION }),
    }).catch(() => null)
    if (!res?.ok) { setError(t.errorFailed); setLoading(false); return }
    router.replace(next); router.refresh()
  }

  return (
    <section className="card auth-card" aria-labelledby="consent-title">
      <h2 id="consent-title">{t.title}</h2>
      <p className="auth-sub">{t.lead}</p>
      {error && <div className="banner error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <ConsentCheckbox
          checked={checked}
          onChange={v => { setChecked(v); if (v) setInvalid(false) }}
          invalid={invalid}
          inputRef={ref}
        />
        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? t.submitting : t.submit}
        </button>
      </form>
      <ConsentTerms />
      <div className="auth-links">
        <SignOutForm />
        <Link className="link" href="/account-deletion">{t.deleteAccount}</Link>
      </div>
    </section>
  )
}
```

Read `SignOutForm.tsx` first: use its real props (it may need a label); if it renders a full-width button, wrap it or pass the `t.signOut` label as it expects.

```tsx
// apps/web/src/app/(frontend)/consent/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import ConsentForm from '@/features/consent/ConsentForm'
import { loadCabinetState } from '@/server/cabinet/load-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getSafeNextPath } from '@/shared/security/safe-next'

export const metadata: Metadata = { robots: { index: false } }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The consent a new account still owes; anyone else is sent on. */
export default async function ConsentPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams
  const raw = Array.isArray(query.next) ? query.next[0] : query.next
  const next = getSafeNextPath(raw ?? null)

  const state = await loadCabinetState()
  if (state.kind === 'signed_out') redirect(`/login?next=${encodeURIComponent('/consent')}`)
  if (state.kind === 'deleting') redirect('/account-deletion')
  if (state.kind === 'open') redirect(next)

  const dict = await getDictionary(await getLocale())
  return (
    <>
      <PublicHeader dict={dict} account="none" />
      <main className="auth-wrap">
        <ConsentForm next={next} />
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}
```

Check `getSafeNextPath`'s signature (`string | null` vs `string | undefined`) and match it.

- [ ] **Step 7: Run tests — PASS; `npx tsc --noEmit -p apps/web`; `npm run lint --workspace @lapka/web`.**

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "Consent: cabinet gate and the /consent page on the web"
```

---

### Task 5: Web — sign-up records consent (email and Yandex)

**Files:**
- Modify: `apps/web/src/features/auth/lib/sign-up-options.ts`, `apps/web/src/features/auth/AuthCard.tsx`, `apps/web/src/features/auth/ProviderButtons.tsx`
- Create: `apps/web/src/features/consent/provider-consent-cookie.ts` (client: set), `apps/web/src/server/consent/callback-consent.ts` (server: read and record)
- Modify: `apps/web/src/app/(backend)/auth/callback/route.ts`
- Modify: dictionaries (drop `tosPrefix`, `tosLink`, `errorTosRequired`)
- Test: `apps/web/tests/unit/auth/sign-up-options.test.ts`, `apps/web/tests/server/consent/callback-consent.test.ts`

**Interfaces:**
- Consumes: `ConsentCheckbox`, `ConsentTerms` (Task 4), `recordConsent`, `loadAccount`.
- Produces:
  - `emailSignUpOptions(origin, next, locale)` → `data: { locale, pd_consent: { version: PD_CONSENT_VERSION, source: 'web' } }`
  - `PROVIDER_CONSENT_COOKIE = 'lapka_pd_consent'`, `rememberProviderConsent(): void`
  - `recordProviderConsent(cookieValue: string | undefined, userId: string): Promise<void>`

- [ ] **Step 1: Failing tests**

`sign-up-options.test.ts` — add:

```ts
it('carries the consent the checkbox gave', () => {
  const options = emailSignUpOptions('https://lapka.my', '/dashboard', 'ru')
  expect(options.data).toEqual({ locale: 'ru', pd_consent: { version: PD_CONSENT_VERSION, source: 'web' } })
})
```

`tests/server/consent/callback-consent.test.ts` — mock `@/server/supabase/server` (`createServiceClient`), `@/server/auth/account-state` (`loadAccount`) and `@/server/consent/consent-service` (`recordConsent` as `vi.fn`):

```ts
it.each([
  ['no cookie', undefined],
  ['a stale edition', '2020-01-01'],
  ['garbage', '<script>'],
])('records nothing for %s', async (_label, value) => {
  await recordProviderConsent(value, 'u1')
  expect(recordConsent).not.toHaveBeenCalled()
})

it('records the current edition for an account that needs it', async () => {
  loadAccount.mockResolvedValue({ ok: true, account: { ...base, pdConsentRequired: true } })
  await recordProviderConsent(PD_CONSENT_VERSION, 'u1')
  expect(recordConsent).toHaveBeenCalledWith(expect.anything(), 'u1', { version: PD_CONSENT_VERSION, source: 'web' })
})

it('leaves an account that owes nothing alone', async () => {
  loadAccount.mockResolvedValue({ ok: true, account: { ...base, pdConsentRequired: false } })
  await recordProviderConsent(PD_CONSENT_VERSION, 'u1')
  expect(recordConsent).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

`sign-up-options.ts`: add `pd_consent: { version: PD_CONSENT_VERSION, source: 'web' as const }` to `data`, with a comment: the form only submits with the checkbox ticked, so the metadata carries that act; the trigger records it.

```ts
// apps/web/src/features/consent/provider-consent-cookie.ts
import { PD_CONSENT_VERSION } from '@lapka/contracts'

export const PROVIDER_CONSENT_COOKIE = 'lapka_pd_consent'

/**
 * Registration with a provider cannot carry sign-up metadata, so the ticked
 * checkbox travels to the callback in a cookie only this site can set: a
 * forged link to /auth/callback cannot consent on somebody's behalf.
 */
export function rememberProviderConsent(): void {
  document.cookie =
    `${PROVIDER_CONSENT_COOKIE}=${PD_CONSENT_VERSION}; Max-Age=900; Path=/auth/callback; SameSite=Lax` +
    (location.protocol === 'https:' ? '; Secure' : '')
}
```

```ts
// apps/web/src/server/consent/callback-consent.ts
import 'server-only'

import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { loadAccount } from '@/server/auth/account-state'
import { recordConsent } from '@/server/consent/consent-service'
import { createServiceClient } from '@/server/supabase/server'

/**
 * After a provider sign-in: if the registration form's checkbox was ticked
 * (the cookie) and the account still owes consent, record it. Anything else —
 * no cookie, another edition, an account that owes nothing — records nothing;
 * the /consent page catches whoever is left.
 */
export async function recordProviderConsent(cookieValue: string | undefined, userId: string): Promise<void> {
  if (cookieValue !== PD_CONSENT_VERSION) return
  const supabase = createServiceClient()
  const account = await loadAccount(supabase, userId)
  if (!account.ok || !account.account.pdConsentRequired) return
  await recordConsent(supabase, userId, { version: PD_CONSENT_VERSION, source: 'web' })
}
```

Callback route: after a successful exchange, read the user from the exchange result (`exchangeCodeForSession` returns `{ data: { user }, error }`), then:

```ts
    const { data, error } = await exchangeCodeForSession(code)
    if (!error) {
      const response = NextResponse.redirect(new URL(safeNext, origin))
      if (data.user) {
        await recordProviderConsent(request.cookies.get(PROVIDER_CONSENT_COOKIE)?.value, data.user.id)
          .catch(() => {}) // never fail a sign-in over this; /consent catches it
      }
      response.cookies.set(PROVIDER_CONSENT_COOKIE, '', { path: '/auth/callback', maxAge: 0 })
      return response
    }
```

Import `PROVIDER_CONSENT_COOKIE` from the client module — it has no DOM access at import time, so it is safe on the server; if the linter objects, move the constant to `apps/web/src/shared/consent.ts` and import it from both.

`ProviderButtons.tsx`: add prop `beforeStart?: () => void`, called right after `canStart` passes and before `signInWithOAuth`. Doc: «Registration uses it to remember the consent for the callback.»

`AuthCard.tsx` `RegisterForm`:
- replace `acceptedTos/tosError/tosRef/requireTos` with `consented/consentInvalid/consentRef/requireConsent` (same logic);
- replace the whole `<div className="auth-terms">…</div>` with `<ConsentCheckbox checked={consented} onChange={…} invalid={consentInvalid} inputRef={consentRef} />`;
- after `<SubmitButton … />`, before `</form>`: nothing; after `<ProviderButtons … />`: `<ConsentTerms />`;
- `<ProviderButtons next={safeNext} canStart={requireConsent} beforeStart={rememberProviderConsent} onError={setError} />`.

`LoginForm`: add `<ConsentTerms />` after its `<ProviderButtons … />`.

Remove the unused `tosPrefix`, `tosLink`, `errorTosRequired` keys from both dictionaries, and the now-unused imports.

- [ ] **Step 4: Run** `npm run test --workspace @lapka/web`, `npx tsc --noEmit -p apps/web`, lint — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Consent: the registration checkbox records consent for email and Yandex"
```

---

### Task 6: Texts — policy, consent, agreement

**Files:**
- Create: `apps/web/src/app/(frontend)/legal/privacy/page.tsx`, `apps/web/src/app/(frontend)/legal/personal-data/page.tsx`, `apps/web/src/components/site/LegalDocument.tsx`
- Modify: `apps/web/src/app/(frontend)/legal/page.tsx`, `apps/web/src/app/sitemap.ts` (if it lists `/legal`)
- Test: `apps/web/tests/unit/legal/legal-pages.test.ts`

**Interfaces:**
- Produces: `LegalDocument({ title, edition, children })` and `LegalSection({ title, children })` shared by the three pages.

- [ ] **Step 1: Failing test** — the web vitest runs in node without a DOM, so the test reads the page sources:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PD_CONSENT_VERSION } from '@lapka/contracts'

const root = join(__dirname, '../../../src/app/(frontend)/legal')

describe('legal texts', () => {
  it('the consent page is tied to the shipped edition', () => {
    const source = readFileSync(join(root, 'personal-data/page.tsx'), 'utf8')
    expect(source).toContain('PD_CONSENT_VERSION')
  })
  it('the agreement points to the policy and the consent', () => {
    const source = readFileSync(join(root, 'page.tsx'), 'utf8')
    expect(source).toContain('/legal/privacy')
    expect(source).toContain('/legal/personal-data')
    expect(source).not.toContain('улучшения качества')
  })
  it('names no country in the texts', () => {
    for (const file of ['privacy/page.tsx', 'personal-data/page.tsx']) {
      const source = readFileSync(join(root, file), 'utf8')
      expect(source).not.toMatch(/США|Япони|Токио|Ирланди|USA|Japan/)
    }
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Shared frame.** Move `LegalSection` and the header/`main`/eyebrow/edition/russianOnly frame from `legal/page.tsx` into `components/site/LegalDocument.tsx` (server component, `async`, takes `title`, `edition` string, `canonical` not needed, `children`, and an optional `footer` node). `legal/page.tsx` uses it, output unchanged except the edits below.

- [ ] **Step 4: Agreement edits** (`legal/page.tsx`)
- edition: «Редакция от 26 сентября 2026 г.»;
- section 5 becomes:

```tsx
<LegalSection title="5. Персональные данные">
  <p>
    Порядок обработки персональных данных пользователей описан в{' '}
    <Link href="/legal/privacy">Политике обработки персональных данных</Link>. Персональные
    данные обрабатываются на основании{' '}
    <Link href="/legal/personal-data">согласия на обработку персональных данных</Link>,
    которое пользователь даёт при регистрации, а также в целях исполнения настоящего
    Соглашения.
  </p>
  <p>
    Пользователь вправе отозвать согласие и потребовать удаления своих данных, удалив
    аккаунт или направив обращение на электронную почту Администрации.
  </p>
</LegalSection>
```

- section 9: drop «возвратом средств, »;
- metadata description: replace «оплата, персональные данные» with «персональные данные».

- [ ] **Step 5: Consent page** (`legal/personal-data/page.tsx`): title «Согласие на обработку персональных данных», edition `Редакция ${PD_CONSENT_VERSION}` formatted as «Редакция от 26 сентября 2026 г.» (format the date with `Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })` from the constant, so the page cannot drift from the code), `alternates.canonical: '/legal/personal-data'`, body — the draft from the spec (section «Черновик согласия»), verbatim, each bold lead as a `LegalSection` title: «Какие данные», «Цели», «Действия», «Кому поручается обработка», «Срок и отзыв». First paragraph without a section. Last line links to `/legal/privacy`. Contact through `supportEmail`.

- [ ] **Step 6: Policy page** (`legal/privacy/page.tsx`): title «Политика обработки персональных данных», edition «Редакция от 26 сентября 2026 г.», canonical `/legal/privacy`. Sections, each 1–4 short paragraphs or a list:

1. **Общие положения** — политика составлена во исполнение ч. 2 ст. 18.1 Федерального закона № 152-ФЗ «О персональных данных»; оператор — Администрация Сервиса «Лапка» (lapka.my и мобильное приложение); контакт — `supportEmail`.
2. **Чьи данные** — пользователи сервиса.
3. **Какие данные** — список: адрес электронной почты; пароль хранится только в виде хеша; данные профиля Яндекс ID, Google или Apple при входе через них (имя, логин, адрес почты); технические данные — IP-адрес и сведения о браузере или устройстве в журналах входа, cookies; сведения о питомцах (кличка, вид, порода, возраст, вес, особенности здоровья, заметки); описания симптомов и ответы на уточняющие вопросы; фотографии, приложенные к проверке; записи медицинской карты питомца (прививки, обработки, лекарства, визиты к врачу, вес); отзывы о результатах. Оговорка: сведения о здоровье животных не являются специальной категорией персональных данных, но пользователь может указать в свободном тексте сведения о себе — просим этого не делать.
4. **Цели** — регистрация и вход; проверки симптомов и медицинская карта; ответы на обращения; безопасность сервиса и предотвращение злоупотреблений.
5. **Правовые основания** — согласие субъекта (п. 1 ч. 1 ст. 6 152-ФЗ); исполнение пользовательского соглашения (п. 5 ч. 1 ст. 6).
6. **Действия с данными** — тот же перечень, что в согласии; смешанная обработка с автоматизацией; решения, порождающие юридические последствия, только на основании автоматизированной обработки не принимаются.
7. **Кому поручается обработка** — Supabase (хранение данных, вход, письма подтверждения), Vercel (работа сайта и сервера), OpenAI (анализ описаний симптомов, сведений о питомце и фотографий; в OpenAI не передаются адрес почты и имя пользователя), Яндекс, Google, Apple (только как способ входа — выбирается пользователем), Expo (доставка обновлений мобильного приложения; получает технические данные запроса). Обработка этими лицами ведётся на серверах за пределами Российской Федерации; трансграничная передача осуществляется на основании согласия пользователя.
8. **Сроки** — до удаления аккаунта или отзыва согласия; фотографии удаляются после анализа и не позднее чем через 3 часа после загрузки; журналы входа — в сроки хранения, установленные поставщиком инфраструктуры; после удаления аккаунта может храниться обезличенная запись о движении проверок по балансу.
9. **Права пользователя** — получить сведения об обработке, потребовать уточнения, блокирования или уничтожения данных, отозвать согласие, обжаловать действия оператора в Роскомнадзоре или в суде; запрос — на `supportEmail`; ответ — в течение 10 рабочих дней (ч. 1 ст. 20 152-ФЗ).
10. **Отзыв согласия** — письмом или удалением аккаунта (ссылка на `/account-deletion`); после отзыва пользоваться сервисом нельзя; данные удаляются в сроки, указанные на странице удаления.
11. **Cookies** — только технические: сессия входа, язык интерфейса (`NEXT_LOCALE`), часовой пояс (`lapka-tz`), защита форм (`lapka_csrf`), отметка согласия при регистрации через провайдера (`lapka_pd_consent`, 15 минут). Аналитических и рекламных cookies нет.
12. **Защита** — передача по HTTPS; доступ к данным разграничен, пользователь видит только свои данные; фотографии хранятся в закрытом хранилище; пароли не хранятся в открытом виде.
13. **Изменения** — новая редакция публикуется на этой странице; при изменении состава данных или целей у пользователя запрашивается новое согласие.

Before writing sections 3, 8 and 11, re-check the facts against the code: `docs/architecture/deletion-data-map.md` (what survives deletion), `apps/web/src/server/uploads/photo-storage.ts` (the 3-hour sweep), `apps/web/src/components/TimeZoneCookie.tsx` and `apps/web/src/server/security/csrf.ts` (cookie names). The text must describe what the code does.

- [ ] **Step 7: Run tests, `npx tsc`, lint, `next build` (`npm run build --workspace @lapka/web`) — PASS.**

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "Legal: personal data policy, consent text, agreement points to them"
```

---

### Task 7: Mobile — checkbox, pending consent, gate, screen

**Files:**
- Create: `apps/mobile/src/features/consent/ConsentCheckbox.tsx`, `apps/mobile/src/features/consent/consent-gate.ts`, `apps/mobile/src/features/consent/consent-gate.test.ts`, `apps/mobile/app/consent.tsx`
- Modify: `apps/mobile/src/lib/api.ts`, `apps/mobile/src/providers/AuthProvider.tsx`, `apps/mobile/src/features/auth/ProviderButtons.tsx`, `apps/mobile/src/features/auth/LegalNote.tsx`, `apps/mobile/app/sign-up.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/src/i18n/ru.ts`, `en.ts`

**Interfaces:**
- Consumes: `api.getConsentStatus`, `api.giveConsent`, `ConsentSource`, `PD_CONSENT_VERSION`.
- Produces:
  - `consentSource(os: string): ConsentSource` — `'android'` for `'android'`, `'ios'` otherwise (the app runs on nothing else).
  - `settleConsent(deps: { pending: boolean; give(): Promise<void>; status(): Promise<{ required: boolean }> }): Promise<'open' | 'consent'>`
  - `setConsentRequiredHandler(handler: () => void)` in `lib/api.ts`
  - `AuthState.consentPending: boolean`, `AuthState.setConsentPending(v: boolean)`
  - `ProviderButtons` prop `canStart?: () => boolean`

- [ ] **Step 1: Failing pure-logic test**

```ts
// apps/mobile/src/features/consent/consent-gate.test.ts
import { describe, expect, it, vi } from 'vitest'
import { consentSource, settleConsent } from './consent-gate'

describe('consentSource', () => {
  it('names the platform', () => {
    expect(consentSource('ios')).toBe('ios')
    expect(consentSource('android')).toBe('android')
  })
})

describe('settleConsent', () => {
  it('sends a pending consent before asking', async () => {
    const calls: string[] = []
    const result = await settleConsent({
      pending: true,
      give: async () => { calls.push('give') },
      status: async () => { calls.push('status'); return { required: false } },
    })
    expect(calls).toEqual(['give', 'status'])
    expect(result).toBe('open')
  })

  it('does not send anything without a pending consent', async () => {
    const give = vi.fn()
    await settleConsent({ pending: false, give, status: async () => ({ required: true }) })
    expect(give).not.toHaveBeenCalled()
  })

  it('still asks when sending failed, so the screen catches it', async () => {
    const result = await settleConsent({
      pending: true,
      give: async () => { throw new Error('offline') },
      status: async () => ({ required: true }),
    })
    expect(result).toBe('consent')
  })

  it('lets the app in when the status cannot be read', async () => {
    // The server refuses with consent_required anyway; the handler then routes.
    const result = await settleConsent({
      pending: false,
      give: async () => {},
      status: async () => { throw new Error('offline') },
    })
    expect(result).toBe('open')
  })
})
```

- [ ] **Step 2: Run — FAIL.** `npm run test --workspace @lapka/mobile -- consent-gate` (check the mobile workspace name in `apps/mobile/package.json`).

- [ ] **Step 3: Pure logic**

```ts
// apps/mobile/src/features/consent/consent-gate.ts
import type { ConsentSource } from '@lapka/contracts'

export function consentSource(os: string): ConsentSource {
  return os === 'android' ? 'android' : 'ios'
}

/**
 * On the way into the app: first hand over the consent given on the
 * registration screen (a provider sign-in cannot carry it), then ask whether
 * any is still owed. A failed hand-over is not an error the person sees — the
 * status says `required` and the consent screen asks again. An unreadable
 * status lets them in: the server refuses with `consent_required`, and that
 * brings the screen up instead.
 */
export async function settleConsent(deps: {
  pending: boolean
  give(): Promise<void>
  status(): Promise<{ required: boolean }>
}): Promise<'open' | 'consent'> {
  if (deps.pending) await deps.give().catch(() => {})
  try {
    return (await deps.status()).required ? 'consent' : 'open'
  } catch {
    return 'open'
  }
}
```

- [ ] **Step 4: API handler** — `lib/api.ts`:

```ts
let onConsentRequired: () => void = () => {}

/** Set by the signed-in layout, which owns navigation to the consent screen. */
export function setConsentRequiredHandler(handler: () => void): void {
  onConsentRequired = handler
}
```

and in `withFreshSession`, wrap: on `ApiError` with `code === 'consent_required'` call `onConsentRequired()` then rethrow (before the `unauthorized` branch).

- [ ] **Step 5: AuthProvider** — add state `const [consentPending, setConsentPending] = useState(false)`; expose `consentPending` and `setConsentPending` in `AuthState` (doc: «The registration screen's ticked checkbox, waiting for a session to be sent with. Memory only.»); `endSession` resets it to `false`; `signUp` metadata becomes `data: { locale: deviceLocale(), pd_consent: { version: PD_CONSENT_VERSION, source: consentSource(Platform.OS) } }` — `signUp` is only reachable with the box ticked (Step 7).

- [ ] **Step 6: Checkbox component**

```tsx
// apps/mobile/src/features/consent/ConsentCheckbox.tsx
import { Pressable, StyleSheet, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useText } from '@/i18n'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius } from '@/ui/theme'

export const CONSENT_URL = 'https://lapka.my/legal/personal-data'

/**
 * The one box to tick: consent to personal-data processing. Unticked until the
 * person ticks it. The link opens the text itself; the rest of the row toggles.
 */
export function ConsentCheckbox({
  checked, onChange, invalid,
}: { checked: boolean; onChange(value: boolean): void; invalid: boolean }) {
  const t = useText()
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${t.consent.checkboxPrefix} ${t.consent.checkboxLink}`}
        onPress={() => onChange(!checked)}
        hitSlop={8}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.boxOn, invalid && styles.boxInvalid]}>
          {checked ? <Icon name="check" size={16} color={colour.onAccent} /> : null}
        </View>
        <Text variant="caption" style={styles.label}>
          {t.consent.checkboxPrefix}{' '}
          <Text
            variant="caption"
            tone="accent"
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(CONSENT_URL)}
            style={styles.link}
          >
            {t.consent.checkboxLink}
          </Text>
        </Text>
      </Pressable>
      {invalid ? <Text variant="caption" tone="error">{t.consent.errorRequired}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: TAP_TARGET, gap: 12 },
  box: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colour.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colour.accent, borderColor: colour.accent },
  boxInvalid: { borderColor: colour.error },
  label: { flex: 1 },
  link: { textDecorationLine: 'underline' },
})
```

Before writing, open `ui/theme.ts`, `ui/Icon.tsx`, `ui/Text.tsx` and replace `colour.onAccent`, `colour.border`, `colour.error`, `radius.sm`, `tone="error"`, `Icon name="check"` with the names that exist there (pick the nearest existing token; do not add new tokens unless none fits).

- [ ] **Step 7: Screens and texts**

i18n `ru.ts` (mirror in `en.ts`):

```ts
  consent: {
    title: 'Согласие на обработку данных',
    lead: 'Чтобы пользоваться Лапкой, нужно ваше согласие на обработку персональных данных.',
    checkboxPrefix: 'Я даю',
    checkboxLink: 'согласие на обработку персональных данных',
    errorRequired: 'Отметьте согласие, чтобы продолжить',
    errorFailed: 'Не удалось сохранить согласие. Попробуйте ещё раз.',
    continue: 'Продолжить',
    signOut: 'Выйти',
  },
```

and in `auth`: `legalLink: 'Пользовательское соглашение'` stays; add `legalAnd: 'и'`, `policyLink: 'Политику обработки персональных данных'`.

`LegalNote.tsx`: add `export const POLICY_URL = 'https://lapka.my/legal/privacy'`; render «Продолжая, вы принимаете [Пользовательское соглашение] и [Политику…]» with the second link opening `POLICY_URL`; update the doc comment — the terms are accepted by continuing; the consent is the separate checkbox on registration.

`ProviderButtons.tsx`: add prop `canStart?: () => boolean`; in `start`, `if (canStart && !canStart()) return` before `running.current = true`.

`sign-up.tsx`:
- state `consented`, `consentInvalid`; `const { session, signUp, setConsentPending } = useAuth()`;
- `function requireConsent() { if (consented) return true; setConsentInvalid(true); return false }`;
- `submit`: `if (!requireConsent()) return` first;
- render `<ConsentCheckbox checked={consented} onChange={(v) => { setConsented(v); if (v) setConsentInvalid(false) }} invalid={consentInvalid} />` between the password field and the error banner;
- `<ProviderButtons canStart={() => { if (!requireConsent()) return false; setConsentPending(true); return true }} onOutcome={(outcome) => { if (outcome.kind !== 'session') setConsentPending(false); setProviderNotice(providerNoticeFor(outcome)) }} />`.

`app/consent.tsx`:

```tsx
import { useState } from 'react'
import { router } from 'expo-router'
import { Platform } from 'react-native'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'
import { useText } from '@/i18n'
import { ConsentCheckbox } from '@/features/consent/ConsentCheckbox'
import { consentSource } from '@/features/consent/consent-gate'
import { LegalNote } from '@/features/auth/LegalNote'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'

/**
 * The consent a new account still owes: signed up through a provider from the
 * sign-in screen, or a new edition of the text. Outside the tabs, like
 * deletion-status, so the tabs' own gate cannot loop back into itself.
 */
export default function Consent() {
  const t = useText()
  const { signOut } = useAuth()
  const [checked, setChecked] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!checked) { setInvalid(true); return }
    setBusy(true); setError(null)
    try {
      await withFreshSession((api) =>
        api.giveConsent({ version: PD_CONSENT_VERSION, source: consentSource(Platform.OS) }))
      router.replace('/pets')
    } catch {
      setError(t.consent.errorFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title={t.consent.title} scroll dock={<Button title={t.consent.continue} onPress={submit} busy={busy} />}>
      <Text>{t.consent.lead}</Text>
      <ConsentCheckbox checked={checked} onChange={(v) => { setChecked(v); if (v) setInvalid(false) }} invalid={invalid} />
      {error ? <Banner text={error} tone="error" /> : null}
      <LegalNote />
      <LinkButton title={t.consent.signOut} onPress={() => void signOut()} />
    </Screen>
  )
}
```

Check `Screen`'s props (`title`, `scroll`, `dock`) against `ui/Screen.tsx` before using them. After `signOut`, the root index redirects to sign-in; if it does not from this screen, add `router.replace('/sign-in')` after `await signOut()`.

`(tabs)/_layout.tsx`:

```tsx
  const { session, loading, consentPending, setConsentPending } = useAuth()
  const [gate, setGate] = useState<'checking' | 'open'>('checking')

  useEffect(() => {
    setConsentRequiredHandler(() => router.replace('/consent'))
  }, [])

  useEffect(() => {
    if (!session) return
    let active = true
    setGate('checking')
    void settleConsent({
      pending: consentPending,
      give: () => withFreshSession((api) =>
        api.giveConsent({ version: PD_CONSENT_VERSION, source: consentSource(Platform.OS) })),
      status: () => withFreshSession((api) => api.getConsentStatus()),
    }).then((result) => {
      if (!active) return
      setConsentPending(false)
      if (result === 'consent') router.replace('/consent')
      else setGate('open')
    })
    return () => { active = false }
    // consentPending is read once per session on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />
  if (gate === 'checking') return null
```

(`setConsentRequiredHandler`, `settleConsent`, `consentSource`, `PD_CONSENT_VERSION`, `Platform`, `router`, `useState` imported.) `session` changes identity on token refresh — confirm by reading `AuthProvider`: if `onAuthStateChange` fires on refresh, key the effect on `session?.user.id` instead of `session`.

- [ ] **Step 8: Run** `npm run test --workspace @lapka/mobile`, `npx tsc --noEmit -p apps/mobile`, mobile lint — PASS.

- [ ] **Step 9: Simulator** (use the `run` skill / memory «Local API for mobile = dev:staging»): sign up by email with the box unticked → refused with the hint; ticked → letter; a Yandex sign-up from the sign-in screen with a fresh staging account → consent screen; tick → pets. Record in the stage report.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile
git commit -m "Consent on mobile: registration checkbox, pending consent for providers, consent screen"
```

---

### Task 8: Docs — roadmap stage 12, deletion map, verification report

**Files:**
- Modify: `docs/mobile-api-plan.md` (new `### Этап 12. Согласие на обработку персональных данных` after Этап 11; add 12 to the execution order line), `docs/architecture/deletion-data-map.md` (row for `personal_data_consents`: removed with `auth.users` by cascade), `docs/verification/README.md` (log line)
- Create: `docs/verification/stage-12.md` from `docs/verification/REPORT_TEMPLATE.md`

- [ ] **Step 1:** Stage 12 in the roadmap — items **12/01–12/06** copied from the spec's «Приёмка» section, each with `**Приёмка:**` in the file's style, plus «Автоматически», «Вручную», «Готово, когда».
- [ ] **Step 2:** Deletion map row; check `deletion-worker.ts` deletes `auth.users` last so the cascade fires; if the worker deletes `profiles` first and then `auth.users`, no change is needed beyond the doc row.
- [ ] **Step 3:** `stage-12.md`: commands run with their results (unit, integration, tsc, lint, build, openapi check), manual web and simulator runs, what was NOT RUN (Android, real devices, production), open gaps from the spec.
- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "Stage 12: roadmap, deletion map and verification report"
```
