import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  ApiErrorEnvelopeSchema,
  CONSENT_EDITIONS_FEATURE,
  ConsentStatusSchema,
  FEATURES_HEADER,
  PD_CONSENT_LEGACY_VERSION,
  PD_CONSENT_VERSION,
} from '@lapka/contracts'
import { OWNER_A, connect, seedFixtures, signIn, bearerRequest, type SeededFixtures } from './fixtures'

/**
 * Stage 12/02: an account created after consent became a separate act cannot
 * use the API until it has consented, but can still read its profile, give the
 * consent, and leave. These requests carry no `consent-editions`, so they are
 * an app build from before the second edition and get the old rules; the
 * second edition is at the end.
 */

const consentRoute = await import('@/app/(backend)/api/v1/consent/route')
const meRoute = await import('@/app/(backend)/api/v1/me/route')
const petsRoute = await import('@/app/(backend)/api/v1/pets/route')
const reauthRoute = await import('@/app/(backend)/api/v1/auth/reauth/route')
const deletionRoute = await import('@/app/(backend)/api/v1/account-deletion/route')

let db: Client
let seeded: SeededFixtures
let token: string

function request(path: string, init: { method?: string; body?: unknown } = {}) {
  return bearerRequest(`${path}`, init, token)
}

/** The site, or an app from 1.3.0: asks for the current edition. */
function currentRequest(path: string, init: { method?: string; body?: unknown } = {}) {
  return bearerRequest(path, { ...init, headers: { [FEATURES_HEADER]: `pet-dates,${CONSENT_EDITIONS_FEATURE}` } }, token)
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
  token = await signIn(OWNER_A.email)
})

afterAll(async () => {
  await db?.end()
})

describe('consent over the API', () => {
  it('does not ask an existing account', async () => {
    const status = await consentRoute.GET(request('/api/v1/consent'), undefined)
    expect(ConsentStatusSchema.parse(await status.json())).toEqual({
      required: false,
      version: PD_CONSENT_LEGACY_VERSION,
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
    const body = { version: PD_CONSENT_LEGACY_VERSION, source: 'ios' }

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

describe('the second edition (2026-11-20)', () => {
  async function editionsOf(userId: string) {
    const { rows } = await db.query<{ pd_consent_version: string | null }>(
      `select pd_consent_version from public.profiles where id = $1`,
      [userId],
    )
    return rows[0]?.pd_consent_version
  }

  it('asks an account that was never asked, on the site and in a new app', async () => {
    const status = await consentRoute.GET(currentRequest('/api/v1/consent'), undefined)
    expect(ConsentStatusSchema.parse(await status.json())).toEqual({ required: true, version: PD_CONSENT_VERSION })
    expect(await codeOf(await petsRoute.GET(currentRequest('/api/v1/pets'), undefined))).toBe('consent_required')
    // The same account from an old build is let in, as before.
    expect((await petsRoute.GET(request('/api/v1/pets'), undefined)).status).toBe(200)
  })

  it('asks again an account that consented to the first edition', async () => {
    await requireConsentFromOwnerA()
    const old = { version: PD_CONSENT_LEGACY_VERSION, source: 'android' }
    expect((await consentRoute.POST(request('/api/v1/consent', { method: 'POST', body: old }), undefined)).status).toBe(204)
    expect(await editionsOf(seeded.ownerAId)).toBe(PD_CONSENT_LEGACY_VERSION)

    expect((await petsRoute.GET(request('/api/v1/pets'), undefined)).status).toBe(200)
    expect(await codeOf(await petsRoute.GET(currentRequest('/api/v1/pets'), undefined))).toBe('consent_required')
  })

  it('opens both kinds of client once the current edition is given', async () => {
    await requireConsentFromOwnerA()
    const body = { version: PD_CONSENT_VERSION, source: 'web' }
    expect((await consentRoute.POST(currentRequest('/api/v1/consent', { method: 'POST', body }), undefined)).status).toBe(204)

    expect(await editionsOf(seeded.ownerAId)).toBe(PD_CONSENT_VERSION)
    expect((await petsRoute.GET(currentRequest('/api/v1/pets'), undefined)).status).toBe(200)
    expect((await petsRoute.GET(request('/api/v1/pets'), undefined)).status).toBe(200)

    // An old build sending the first edition afterwards does not move the account back.
    const old = { version: PD_CONSENT_LEGACY_VERSION, source: 'ios' }
    expect((await consentRoute.POST(request('/api/v1/consent', { method: 'POST', body: old }), undefined)).status).toBe(204)
    expect(await editionsOf(seeded.ownerAId)).toBe(PD_CONSENT_VERSION)
  })
})
