import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { FIXTURE_PASSWORD, OWNER_A, connect, seedFixtures, type SeededFixtures } from './fixtures'

let db: Client
let seeded: SeededFixtures

function admin() {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function createUser(email: string, metadata: unknown): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
    user_metadata: metadata as Record<string, unknown>,
  })
  if (error) throw error
  return data.user.id
}

async function consentsOf(userId: string) {
  const { rows } = await db.query<{ version: string; source: string }>(
    `select version, source from public.personal_data_consents where user_id = $1`,
    [userId],
  )
  return rows
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
})

afterAll(async () => {
  await db?.end()
})

describe('personal data consent schema', () => {
  it('accepts the edition the code ships', async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select public.pd_consent_version_is_current($1) as ok`,
      [PD_CONSENT_VERSION],
    )
    expect(rows[0].ok).toBe(true)
  })

  it('rejects any other edition', async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select public.pd_consent_version_is_current('2020-01-01') as ok,
              public.pd_consent_version_is_current(null) as none`,
    )
    expect(rows[0]).toEqual({ ok: false, none: false })
  })

  it('leaves the fixture owners, standing for existing accounts, without the requirement', async () => {
    const { rows } = await db.query<{ pd_consent_required: boolean }>(
      `select pd_consent_required from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].pd_consent_required).toBe(false)
  })

  it('makes a new profile require consent', async () => {
    const id = await createUser('new-no-consent@fixture.local', {})
    const { rows } = await db.query<{ pd_consent_required: boolean }>(
      `select pd_consent_required from public.profiles where id = $1`,
      [id],
    )
    expect(rows[0].pd_consent_required).toBe(true)
    expect(await consentsOf(id)).toEqual([])
  })

  it('records consent from sign-up metadata', async () => {
    const id = await createUser('with-consent@fixture.local', {
      locale: 'ru',
      pd_consent: { version: PD_CONSENT_VERSION, source: 'ios' },
    })
    expect(await consentsOf(id)).toEqual([{ version: PD_CONSENT_VERSION, source: 'ios' }])
  })

  it.each([
    ['a string', 'yes'],
    ['a stale edition', { version: '2020-01-01', source: 'web' }],
    ['an unknown source', { version: PD_CONSENT_VERSION, source: 'fax' }],
    ['a number for the edition', { version: 5, source: 'web' }],
    ['an array', [1, 2]],
    ['null', null],
  ])('ignores %s without failing the sign-up', async (_label, value) => {
    const id = await createUser(`junk-${Math.random().toString(36).slice(2)}@fixture.local`, {
      pd_consent: value,
    })
    expect(await consentsOf(id)).toEqual([])
  })

  it('keeps one row per user and edition', async () => {
    await expect(
      db.query(
        `insert into public.personal_data_consents (user_id, version, source)
         values ($1, $2, 'web'), ($1, $2, 'web')`,
        [seeded.ownerAId, PD_CONSENT_VERSION],
      ),
    ).rejects.toThrow()
  })

  it('refuses a source outside the list', async () => {
    await expect(
      db.query(
        `insert into public.personal_data_consents (user_id, version, source) values ($1, $2, 'fax')`,
        [seeded.ownerAId, PD_CONSENT_VERSION],
      ),
    ).rejects.toThrow()
  })

  it('removes consents together with the user', async () => {
    const id = await createUser('cascade@fixture.local', {
      pd_consent: { version: PD_CONSENT_VERSION, source: 'web' },
    })
    await db.query(`delete from public.profiles where id = $1`, [id])
    const { error } = await admin().auth.admin.deleteUser(id)
    if (error) throw error
    expect(await consentsOf(id)).toEqual([])
  })

  it('is invisible to a user token', async () => {
    await db.query(
      `insert into public.personal_data_consents (user_id, version, source) values ($1, $2, 'web')`,
      [seeded.ownerAId, PD_CONSENT_VERSION],
    )
    const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await client.auth.signInWithPassword({ email: OWNER_A.email, password: FIXTURE_PASSWORD })
    if (error) throw error
    const { data } = await client.from('personal_data_consents').select('id')
    expect(data ?? []).toEqual([])
  })
})
