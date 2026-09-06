import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, PublicProfileSchema } from '@lapka/contracts'
import { GET as healthRoute } from '@/app/(backend)/api/v1/health/route'
import { GET as meRoute, PATCH as patchMeRoute } from '@/app/(backend)/api/v1/me/route'
import { CSRF_COOKIE_NAME } from '@/server/security/csrf'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, connect, seedFixtures, type SeededFixtures } from './fixtures'

let db: Client
let seeded: SeededFixtures
let tokenA: string
let tokenB: string

async function signIn(email: string): Promise<string> {
  const client = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: FIXTURE_PASSWORD,
  })
  if (error) throw error
  return data.session!.access_token
}

function request(headers: Record<string, string> = {}, init: { method?: string; body?: string } = {}) {
  return new NextRequest('http://test.local/api/v1/me', {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
  })
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

afterAll(async () => {
  await db?.end()
})

describe('health', () => {
  it('answers without a token and says nothing about the database', async () => {
    const response = await healthRoute()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('bearer authentication', () => {
  it('accepts a real token and returns the caller’s own profile', async () => {
    const response = await meRoute(request(bearer(tokenA)), undefined)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.id).toBe(seeded.ownerAId)
    expect(body.credits).toBe(OWNER_A.expectedCredits)
    expect(body.locale).toBe(OWNER_A.locale)
  })

  it('gives each caller their own profile, never the other one', async () => {
    const forB = await (await meRoute(request(bearer(tokenB)), undefined)).json()

    expect(forB.id).toBe(seeded.ownerBId)
    expect(forB.credits).toBe(OWNER_B.expectedCredits)
    expect(forB.credits).not.toBe(OWNER_A.expectedCredits)
  })

  it.each([
    ['no header', {}],
    ['a non-bearer scheme', { authorization: `Basic ${'x'.repeat(20)}` }],
    ['a malformed token', { authorization: 'Bearer not-a-jwt' }],
    ['an empty bearer', { authorization: 'Bearer ' }],
    [
      'a token from another project',
      {
        authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0wMDAwMDAwMDAwMDEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwfQ.0000000000000000000000000000000000000000000',
      },
    ],
  ])('refuses %s', async (_name, headers) => {
    const response = await meRoute(request(headers), undefined)

    expect(response.status).toBe(401)
    const envelope = ApiErrorEnvelopeSchema.parse(await response.json())
    expect(envelope.error.code).toBe('unauthorized')
    expect(envelope.error.request_id).toBeTruthy()
  })

  it('does not fall back to cookies when the bearer is wrong', async () => {
    const response = await meRoute(
      request({
        authorization: 'Bearer not-a-jwt',
        cookie: `${CSRF_COOKIE_NAME}=token; sb-access-token=${tokenA}`,
      }),
      undefined,
    )

    expect(response.status).toBe(401)
  })

  it('refuses a valid token once the account is being deleted', async () => {
    await db.query(`update public.profiles set status = 'deleting' where id = $1`, [seeded.ownerAId])

    const response = await meRoute(request(bearer(tokenA)), undefined)

    expect(response.status).toBe(403)
    const envelope = ApiErrorEnvelopeSchema.parse(await response.json())
    expect(envelope.error.code).toBe('account_deleting')

    await db.query(`update public.profiles set status = 'active' where id = $1`, [seeded.ownerAId])
  })

  it('refuses a cryptographically valid token whose account is gone', async () => {
    // A throwaway owner with no pets: the pets foreign key would otherwise stop
    // the profile row from being removed, which is the very problem stage 8 has
    // to solve for real deletions.
    const admin = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const created = await admin.auth.admin.createUser({
      email: 'orphan@fixture.local',
      password: FIXTURE_PASSWORD,
      email_confirm: true,
    })
    if (created.error) throw created.error

    const orphanToken = await signIn('orphan@fixture.local')
    await db.query(`delete from public.profiles where id = $1`, [created.data.user.id])

    const response = await meRoute(request(bearer(orphanToken)), undefined)

    expect(response.status).toBe(401)
    const envelope = ApiErrorEnvelopeSchema.parse(await response.json())
    expect(envelope.error.code).toBe('unauthorized')

    await admin.auth.admin.deleteUser(created.data.user.id)
  })
})

describe('what /me may return', () => {
  it('carries only the contract fields', async () => {
    const body = await (await meRoute(request(bearer(tokenA)), undefined)).json()

    expect(Object.keys(body).sort()).toEqual([
      'account_status',
      'capabilities',
      'credits',
      'id',
      'locale',
      'role',
    ])
    expect(PublicProfileSchema.parse(body)).toEqual(body)
  })

  it('leaks no email, token or Supabase internals', async () => {
    const raw = await (await meRoute(request(bearer(tokenA)), undefined)).text()

    for (const forbidden of ['@fixture.local', 'access_token', 'app_metadata', 'aud', 'eyJ']) {
      expect(raw).not.toContain(forbidden)
    }
  })

  it('marks private responses no-store and carries a request id', async () => {
    const response = await meRoute(request(bearer(tokenA)), undefined)

    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })
})

describe('what a caller may change through /me', () => {
  it('changes the locale', async () => {
    const response = await patchMeRoute(
      request({ ...bearer(tokenA), 'content-type': 'application/json' }, {
        method: 'PATCH',
        body: JSON.stringify({ locale: 'en' }),
      }),
      undefined,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ locale: 'en' })

    const { rows } = await db.query<{ locale: string }>(
      `select locale from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].locale).toBe('en')
  })

  it.each([
    ['the balance', { credits: 9999 }],
    ['the role', { role: 'admin' }],
    ['the account state', { status: 'deleting' }],
    ['someone else as the owner', { id: '00000000-0000-4000-8000-000000000000' }],
    ['an unsupported locale', { locale: 'de' }],
    ['nothing at all', {}],
  ])('refuses to change %s', async (_name, body) => {
    const response = await patchMeRoute(
      request({ ...bearer(tokenA), 'content-type': 'application/json' }, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      undefined,
    )

    expect(response.status).toBe(400)

    const { rows } = await db.query<{ credits: number; role: string; status: string }>(
      `select credits, role, status from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0]).toMatchObject({ credits: OWNER_A.expectedCredits, role: 'user', status: 'active' })
  })

  it('refuses a body that is not JSON', async () => {
    const response = await patchMeRoute(
      request({ ...bearer(tokenA), 'content-type': 'application/json' }, {
        method: 'PATCH',
        body: 'not json',
      }),
      undefined,
    )

    expect(response.status).toBe(400)
  })
})
