import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, CheckFeedbackSchema, ExtraCheckRequestStatusSchema } from '@lapka/contracts'
import { CHECK_IDS, FIXTURE_PASSWORD, OWNER_A, connect, seedFixtures, type SeededFixtures } from './fixtures'

// Telegram is the only outside service these routes touch. It is replaced so
// the suite never sends a real message, and so the failure path can be driven
// on purpose.
vi.mock('@/server/extra-check/telegram', () => ({
  sendExtraCheckRequestToTelegram: vi.fn(async () => ({ chatId: 1, messageId: 2 })),
  getTelegramApprovalChatId: () => '1',
  getTelegramWebhookSecret: () => 'secret',
  isTelegramWebhookAuthorized: () => true,
  isApprovalChat: () => true,
}))

const { GET: getExtra, POST: postExtra } = await import(
  '@/app/(backend)/api/v1/credits/extra-request/route'
)
const { POST: postFeedback } = await import('@/app/(backend)/api/v1/feedback/route')
const { GET: getFeedback } = await import('@/app/(backend)/api/v1/checks/[id]/feedback/route')
const { resolveExtraCheckRequest } = await import('@/server/extra-check/extra-check-service')

let db: Client
let seeded: SeededFixtures
let token: string

async function signIn(): Promise<string> {
  const client = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data, error } = await client.auth.signInWithPassword({
    email: OWNER_A.email,
    password: FIXTURE_PASSWORD,
  })
  if (error) throw error
  return data.session!.access_token
}

function request(url: string, init: { method?: string; body?: unknown } = {}) {
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

async function errorCode(response: Response): Promise<string> {
  return ApiErrorEnvelopeSchema.parse(await response.json()).error.code
}

async function creditsOf(userId: string): Promise<number> {
  const { rows } = await db.query<{ credits: number }>(
    `select credits from public.profiles where id = $1`,
    [userId],
  )
  return rows[0].credits
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

describe('extra check requests', () => {
  it('reports no request before one is made', async () => {
    const response = await getExtra(request('http://test.local/api/v1/credits/extra-request'), undefined)

    expect(response.status).toBe(200)
    expect(ExtraCheckRequestStatusSchema.parse(await response.json())).toEqual({ status: null })
  })

  it('refuses while checks are still on the balance', async () => {
    const response = await postExtra(
      request('http://test.local/api/v1/credits/extra-request', { method: 'POST' }),
      undefined,
    )

    expect(response.status).toBe(409)
    expect(await errorCode(response)).toBe('conflict')
  })

  it('creates one pending request and refuses a second', async () => {
    await db.query(`update public.profiles set credits = 0 where id = $1`, [seeded.ownerAId])

    const first = await postExtra(
      request('http://test.local/api/v1/credits/extra-request', { method: 'POST' }),
      undefined,
    )
    expect(first.status).toBe(200)
    expect(ExtraCheckRequestStatusSchema.parse(await first.json())).toEqual({ status: 'pending' })

    const second = await postExtra(
      request('http://test.local/api/v1/credits/extra-request', { method: 'POST' }),
      undefined,
    )
    expect(second.status).toBe(409)

    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.extra_check_requests
       where user_id = $1 and status = 'pending'`,
      [seeded.ownerAId],
    )
    expect(rows[0].count).toBe('1')
  })

  it('grants exactly one credit however many times the approval arrives', async () => {
    await db.query(`update public.profiles set credits = 0 where id = $1`, [seeded.ownerAId])
    await postExtra(request('http://test.local/api/v1/credits/extra-request', { method: 'POST' }), undefined)

    const { rows: pending } = await db.query<{ id: string }>(
      `select id from public.extra_check_requests where user_id = $1 and status = 'pending'`,
      [seeded.ownerAId],
    )
    const requestId = pending[0].id

    const first = await resolveExtraCheckRequest({
      requestId,
      action: 'approve',
      adminTelegramId: 42,
      adminUsername: 'admin',
    })
    expect(first.status).toBe('approved')
    expect(await creditsOf(seeded.ownerAId)).toBe(1)

    // A retried Telegram callback must not pay out twice.
    const second = await resolveExtraCheckRequest({
      requestId,
      action: 'approve',
      adminTelegramId: 42,
      adminUsername: 'admin',
    })
    expect(second.status).toBe('already_resolved')
    expect(await creditsOf(seeded.ownerAId)).toBe(1)

    // Counted through the request's own link rather than by reason: the
    // fixtures grant checks the same way, and this test is about this request.
    const { rows: ledger } = await db.query<{ count: string }>(
      `select count(*) as count from public.credit_ledger l
       join public.extra_check_requests r on r.granted_ledger_id = l.id
       where r.id = $1`,
      [requestId],
    )
    expect(ledger[0].count).toBe('1')
  })

  it('reports the status the site would show', async () => {
    await db.query(`update public.profiles set credits = 0 where id = $1`, [seeded.ownerAId])
    await postExtra(request('http://test.local/api/v1/credits/extra-request', { method: 'POST' }), undefined)

    const response = await getExtra(request('http://test.local/api/v1/credits/extra-request'), undefined)

    expect(ExtraCheckRequestStatusSchema.parse(await response.json())).toEqual({ status: 'pending' })
  })
})

describe('feedback on a check', () => {
  const feedbackOf = async (checkId: string) =>
    getFeedback(request(`http://test.local/api/v1/checks/${checkId}/feedback`), {
      params: Promise.resolve({ id: checkId }),
    })

  it('stores one opinion on the caller’s check', async () => {
    const response = await postFeedback(
      request('http://test.local/api/v1/feedback', {
        method: 'POST',
        body: { check_id: CHECK_IDS.aFirst, rating: 'liked', comment: 'помогло' },
      }),
      undefined,
    )

    expect(response.status).toBe(204)

    const { rows } = await db.query<{ user_id: string; symptom_check_id: string; rating: string; comment: string }>(
      `select user_id, symptom_check_id, rating, comment from public.user_feedback`,
    )
    expect(rows).toEqual([
      { user_id: seeded.ownerAId, symptom_check_id: CHECK_IDS.aFirst, rating: 'liked', comment: 'помогло' },
    ])
  })

  it('replaces the opinion when the person changes their mind', async () => {
    const send = (rating: string) =>
      postFeedback(
        request('http://test.local/api/v1/feedback', {
          method: 'POST',
          body: { check_id: CHECK_IDS.aFirst, rating },
        }),
        undefined,
      )

    expect((await send('liked')).status).toBe(204)
    expect((await send('disliked')).status).toBe(204)

    const { rows } = await db.query<{ rating: string; comment: string | null }>(
      `select rating, comment from public.user_feedback`,
    )
    expect(rows).toEqual([{ rating: 'disliked', comment: null }])
  })

  it('takes an opinion on every check, not one a day', async () => {
    for (const checkId of [CHECK_IDS.aFirst, CHECK_IDS.aSecond]) {
      const response = await postFeedback(
        request('http://test.local/api/v1/feedback', {
          method: 'POST',
          body: { check_id: checkId, rating: 'liked' },
        }),
        undefined,
      )
      expect(response.status).toBe(204)
    }

    const { rows } = await db.query<{ count: string }>(`select count(*) as count from public.user_feedback`)
    expect(rows[0].count).toBe('2')
  })

  it.each([
    ['someone else’s check', CHECK_IDS.bOnly],
    ['a check that does not exist', '33333333-3333-4333-8333-000000000999'],
  ])('answers 404 for %s and stores nothing', async (_name, checkId) => {
    const response = await postFeedback(
      request('http://test.local/api/v1/feedback', {
        method: 'POST',
        body: { check_id: checkId, rating: 'liked' },
      }),
      undefined,
    )

    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe('not_found')

    const { rows } = await db.query<{ count: string }>(`select count(*) as count from public.user_feedback`)
    expect(rows[0].count).toBe('0')
  })

  it('reads back the opinion so the result screen can show it', async () => {
    expect(CheckFeedbackSchema.parse(await (await feedbackOf(CHECK_IDS.aFirst)).json())).toEqual({ rating: null })

    await postFeedback(
      request('http://test.local/api/v1/feedback', {
        method: 'POST',
        body: { check_id: CHECK_IDS.aFirst, rating: 'disliked' },
      }),
      undefined,
    )

    expect(CheckFeedbackSchema.parse(await (await feedbackOf(CHECK_IDS.aFirst)).json())).toEqual({
      rating: 'disliked',
    })
  })

  it('hides someone else’s check behind the answer for a missing one', async () => {
    const response = await feedbackOf(CHECK_IDS.bOnly)

    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe('not_found')
  })

  it('goes with the check it is about', async () => {
    await postFeedback(
      request('http://test.local/api/v1/feedback', {
        method: 'POST',
        body: { check_id: CHECK_IDS.aFirst, rating: 'liked' },
      }),
      undefined,
    )

    await db.query(`delete from public.credit_ledger where symptom_check_id = $1`, [CHECK_IDS.aFirst])
    await db.query(`delete from public.symptom_checks where id = $1`, [CHECK_IDS.aFirst])

    const { rows } = await db.query<{ count: string }>(`select count(*) as count from public.user_feedback`)
    expect(rows[0].count).toBe('0')
  })

  it.each([
    ['an unknown rating', { check_id: CHECK_IDS.aFirst, rating: 'meh' }],
    ['no rating', { check_id: CHECK_IDS.aFirst }],
    ['no check', { rating: 'liked' }],
    ['a comment past the limit', { check_id: CHECK_IDS.aFirst, rating: 'liked', comment: 'x'.repeat(2001) }],
    ['an extra field', { check_id: CHECK_IDS.aFirst, rating: 'liked', user_id: '00000000-0000-4000-8000-000000000000' }],
  ])('refuses %s and stores nothing', async (_name, body) => {
    const response = await postFeedback(
      request('http://test.local/api/v1/feedback', { method: 'POST', body }),
      undefined,
    )

    expect(response.status).toBe(400)

    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.user_feedback`,
    )
    expect(rows[0].count).toBe('0')
  })
})
