import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { POST as webDeletionRoute } from '@/app/(backend)/api/account-deletion/route'
import { POST as webReauthRoute } from '@/app/(backend)/api/account-deletion/reauth/route'
import { POST as apiDeletionRoute } from '@/app/(backend)/api/v1/account-deletion/route'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/server/security/csrf'
import { createServiceClient } from '@/server/supabase/server'
import { issueReauthProof } from '@/server/auth/reauth'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * The cookie session, stubbed.
 *
 * `getAuthUser` reads `cookies()` from `next/headers`, which only exists inside
 * a real request. Everything this file is about happens after that call, so the
 * stub stands in for the browser rather than for anything under test: who is
 * signed in is established by Next, and the rules that follow are ours.
 */
let signedInAs: string | null = null
/** The access token the browser's session would carry, for the freshness check. */
let sessionToken: string | null = null

vi.mock('@/server/auth/get-auth-user', () => ({
  getAuthUser: async () => (signedInAs ? { id: signedInAs } : null),
}))
vi.mock('@/server/auth/get-auth-session', () => ({
  getAuthSession: async () =>
    signedInAs && sessionToken ? { user: { id: signedInAs }, accessToken: sessionToken } : null,
}))

/**
 * Stage 9/03: the site and the phone go through one process.
 *
 * The two adapters differ only in how they establish who is calling — cookies
 * and a CSRF token on the site, a Bearer token on the phone. Everything after
 * that is the same service, so the two cannot drift into disagreeing about what
 * deleting an account means or about how many times it may be started.
 */

let db: Client
let seeded: SeededFixtures

function service() {
  return createServiceClient()
}

const CSRF = 'a'.repeat(32)

async function tokenFor(email: string): Promise<string> {
  const client = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

async function proofFor(userId: string): Promise<string> {
  const proof = await issueReauthProof(service(), userId, 'account_deletion')
  return proof!.token
}

/** A request as the browser makes it: cookie session, CSRF header, JSON body. */
function webRequest(body: unknown, options: { csrf?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.csrf !== false) {
    headers.cookie = `${CSRF_COOKIE_NAME}=${CSRF}`
    headers[CSRF_HEADER_NAME] = CSRF
  }

  return new NextRequest('https://lapka.my/api/account-deletion', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
})

afterAll(async () => {
  await db.end()
})

describe('the web adapter', () => {
  it('refuses a request with no CSRF token, before looking at anything else', async () => {
    const response = await webDeletionRoute(
      webRequest({ receipt_secret: '1'.repeat(64), reauth_token: 'anything' }, { csrf: false }),
    )

    expect(response.status).toBe(403)

    // And nothing was started: a refused request must not have marked the
    // account on its way to being refused.
    const { rows } = await db.query<{ status: string }>(
      `select status from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].status).toBe('active')
    expect(
      (await db.query(`select 1 from public.deletion_jobs`)).rowCount,
    ).toBe(0)
  })

  it('refuses a valid CSRF token with no session', async () => {
    // Being able to reach the page is not permission to delete an account.
    signedInAs = null

    const response = await webDeletionRoute(
      webRequest({ receipt_secret: '1'.repeat(64), reauth_token: await proofFor(seeded.ownerAId) }),
    )

    expect(response.status).toBe(401)
    expect((await db.query(`select 1 from public.deletion_jobs`)).rowCount).toBe(0)
  })

  it('refuses a session without a proof of fresh authentication', async () => {
    signedInAs = seeded.ownerAId

    const response = await webDeletionRoute(
      webRequest({ receipt_secret: '1'.repeat(64), reauth_token: 'invented' }),
    )

    expect(response.status).toBe(401)
    expect((await db.query(`select 1 from public.deletion_jobs`)).rowCount).toBe(0)
  })

  it('accepts a complete request, and says accepted rather than done', async () => {
    signedInAs = seeded.ownerAId

    const response = await webDeletionRoute(
      webRequest({
        receipt_secret: '5'.repeat(64),
        reauth_token: await proofFor(seeded.ownerAId),
      }),
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'accepted' })
    expect(response.headers.get('cache-control')).toBe('no-store')

    const { rows } = await db.query<{ status: string }>(
      `select p.status from public.profiles p where p.id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].status).toBe('deleting')
  })
})

describe('the api adapter', () => {
  it('refuses a Bearer token without a proof of fresh authentication', async () => {
    // Owner B, who is still active: owner A was accepted by the block above,
    // and an account already leaving is turned away earlier and for a different
    // reason — which is correct, but not what this test is about.
    const request = new NextRequest('https://lapka.my/api/v1/account-deletion', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await tokenFor(OWNER_B.email)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ receipt_secret: '2'.repeat(64), reauth_token: 'invented' }),
    })

    const response = await apiDeletionRoute(request, undefined)
    expect(response.status).toBe(401)

    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('reauth_required')
    expect(
      (await db.query(`select 1 from public.deletion_jobs where user_id = $1`, [seeded.ownerBId]))
        .rowCount,
    ).toBe(0)
  })

  it('accepts, and says accepted rather than done', async () => {
    const request = new NextRequest('https://lapka.my/api/v1/account-deletion', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await tokenFor(OWNER_B.email)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        receipt_secret: '3'.repeat(64),
        reauth_token: await proofFor(seeded.ownerBId),
      }),
    })

    const response = await apiDeletionRoute(request, undefined)

    // 202, not 200: the request has been taken, the work has not been done.
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'accepted' })
    expect(response.headers.get('cache-control')).toBe('no-store')

    const { rows } = await db.query<{ status: string }>(
      `select status from public.deletion_jobs where user_id = $1`,
      [seeded.ownerBId],
    )
    // The job is pending, which is a different thing from the answer being
    // "completed" — 9/03 asks for exactly that distinction.
    expect(rows[0].status).toBe('pending')
  })
})

describe('both adapters', () => {
  it('reach the same service, so asking twice from two places adds nothing', async () => {
    // Owner A was accepted through the site above. Now the same person asks
    // again from the phone, with a fresh proof — two devices, one account.
    const request = new NextRequest('https://lapka.my/api/v1/account-deletion', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await tokenFor(OWNER_A.email)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        receipt_secret: '6'.repeat(64),
        reauth_token: await proofFor(seeded.ownerAId),
      }),
    })

    // The account is already `deleting`, so the API gate turns it away before
    // the handler — which is the same mechanism that stops every other route
    // accepting work, not a rule invented for this one.
    const response = await apiDeletionRoute(request, undefined)
    expect(response.status).toBe(403)

    const { rows } = await db.query<{ n: string }>(
      `select count(*) n from public.deletion_jobs where user_id = $1`,
      [seeded.ownerAId],
    )
    expect(Number(rows[0].n)).toBe(1)
  })

  it('leaves the other owner where they were', async () => {
    const { rows } = await db.query<{ status: string }>(
      `select status from public.profiles where id = $1`,
      [seeded.ownerBId],
    )
    expect(rows[0].status).toBe('deleting')

    // One job each, and neither request wrote the other's.
    const jobs = await db.query<{ user_id: string }>(`select user_id from public.deletion_jobs`)
    expect(jobs.rows.map((r) => r.user_id).sort()).toEqual(
      [seeded.ownerAId, seeded.ownerBId].sort(),
    )
  })
})

describe('proving ownership from the site', () => {
  /** A token's payload, unsigned: the freshness check reads a claim, not a signature. */
  function tokenAuthenticatedAt(secondsAgo: number): string {
    const payload = { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - secondsAgo }] }
    return `h.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.s`
  }

  function reauthRequest(csrf = true): NextRequest {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (csrf) {
      headers.cookie = `${CSRF_COOKIE_NAME}=${CSRF}`
      headers[CSRF_HEADER_NAME] = CSRF
    }
    return new NextRequest('https://lapka.my/api/account-deletion/reauth', {
      method: 'POST',
      headers,
      body: '{}',
    })
  }

  it('refuses without a CSRF token', async () => {
    signedInAs = seeded.ownerBId
    sessionToken = tokenAuthenticatedAt(5)

    expect((await webReauthRoute(reauthRequest(false))).status).toBe(403)
  })

  it('refuses a session that authenticated too long ago', async () => {
    // Reading this page, or having read it a month ago, is not ownership.
    signedInAs = seeded.ownerBId
    sessionToken = tokenAuthenticatedAt(60 * 60)

    const response = await webReauthRoute(reauthRequest())
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'reauth_required' })
  })

  it('issues a proof to somebody who has just signed in', async () => {
    // Signing in on the page *is* the proof of ownership 9/02 asks for.
    signedInAs = seeded.ownerBId
    sessionToken = tokenAuthenticatedAt(5)

    const response = await webReauthRoute(reauthRequest())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')

    const body = (await response.json()) as { token: string }
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)

    // Stored as a hash, like every other proof.
    const { rows } = await db.query<{ token_hash: string }>(
      `select token_hash from public.reauth_proofs where user_id = $1 order by created_at desc limit 1`,
      [seeded.ownerBId],
    )
    expect(rows[0].token_hash).not.toBe(body.token)
  })

  it('refuses when nobody is signed in at all', async () => {
    signedInAs = null
    sessionToken = null

    expect((await webReauthRoute(reauthRequest())).status).toBe(401)
  })
})
