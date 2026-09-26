import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, ConsentStatusSchema, PD_CONSENT_VERSION } from '@lapka/contracts'
import { FIXTURE_PASSWORD, OWNER_A, connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 12/02: an account created after consent became a separate act cannot
 * use the API until it has consented, but can still read its profile, give the
 * consent, and leave.
 */

const consentRoute = await import('@/app/(backend)/api/v1/consent/route')
const meRoute = await import('@/app/(backend)/api/v1/me/route')
const petsRoute = await import('@/app/(backend)/api/v1/pets/route')
const reauthRoute = await import('@/app/(backend)/api/v1/auth/reauth/route')
const deletionRoute = await import('@/app/(backend)/api/v1/account-deletion/route')

let db: Client
let seeded: SeededFixtures
let token: string

async function signIn(): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email: OWNER_A.email,
    password: FIXTURE_PASSWORD,
  })
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

async function codeOf(response: Response): Promise<string> {
  return ApiErrorEnvelopeSchema.parse(await response.json()).error.code
}

async function requireConsentFromOwnerA() {
  await db.query(`update public.profiles set pd_consent_required = true where id = $1`, [seeded.ownerAId])
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  await db.query('truncate table public.api_rate_limits')
  token = await signIn()
})

afterAll(async () => {
  await db?.end()
})

describe('consent over the API', () => {
  it('does not ask an existing account', async () => {
    const status = await consentRoute.GET(request('/api/v1/consent'), undefined)
    expect(ConsentStatusSchema.parse(await status.json())).toEqual({
      required: false,
      version: PD_CONSENT_VERSION,
    })
    expect((await petsRoute.GET(request('/api/v1/pets'), undefined)).status).toBe(200)
  })

  it('refuses business routes until a new account consents', async () => {
    await requireConsentFromOwnerA()

    const pets = await petsRoute.GET(request('/api/v1/pets'), undefined)

    expect(pets.status).toBe(403)
    expect(await codeOf(pets)).toBe('consent_required')
  })

  it('still serves the profile and the consent status without consent', async () => {
    await requireConsentFromOwnerA()

    expect((await meRoute.GET(request('/api/v1/me'), undefined)).status).toBe(200)
    const status = await consentRoute.GET(request('/api/v1/consent'), undefined)
    expect(ConsentStatusSchema.parse(await status.json()).required).toBe(true)
  })

  it('lets an account without consent leave', async () => {
    await requireConsentFromOwnerA()

    const reauth = await reauthRoute.POST(
      request('/api/v1/auth/reauth', { method: 'POST', body: {} }),
      undefined,
    )
    const deletion = await deletionRoute.POST(
      request('/api/v1/account-deletion', { method: 'POST', body: {} }),
      undefined,
    )

    expect(await codeOf(reauth)).not.toBe('consent_required')
    expect(await codeOf(deletion)).not.toBe('consent_required')
  })

  it('records consent once and opens the API', async () => {
    await requireConsentFromOwnerA()
    const body = { version: PD_CONSENT_VERSION, source: 'ios' }

    const first = await consentRoute.POST(request('/api/v1/consent', { method: 'POST', body }), undefined)
    const again = await consentRoute.POST(request('/api/v1/consent', { method: 'POST', body }), undefined)

    expect([first.status, again.status]).toEqual([204, 204])
    const { rows } = await db.query(
      `select source from public.personal_data_consents where user_id = $1`,
      [seeded.ownerAId],
    )
    expect(rows).toEqual([{ source: 'ios' }])
    expect((await petsRoute.GET(request('/api/v1/pets'), undefined)).status).toBe(200)
  })

  it('refuses a stale edition and a malformed body', async () => {
    await requireConsentFromOwnerA()

    const stale = await consentRoute.POST(
      request('/api/v1/consent', { method: 'POST', body: { version: '2020-01-01', source: 'web' } }),
      undefined,
    )
    const junk = await consentRoute.POST(
      request('/api/v1/consent', { method: 'POST', body: { yes: true } }),
      undefined,
    )

    expect(await codeOf(stale)).toBe('bad_request')
    expect(await codeOf(junk)).toBe('bad_request')
    const { rows } = await db.query(
      `select 1 from public.personal_data_consents where user_id = $1`,
      [seeded.ownerAId],
    )
    expect(rows).toEqual([])
  })
})
