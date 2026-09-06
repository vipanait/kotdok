import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { RATE_LIMITS, consumeRateLimit } from '@/server/api/rate-limit'
import { connect } from './fixtures'

let db: Client

/**
 * Two independent clients stand in for two server instances. They must spend
 * one allowance between them, not one each.
 */
function instance(): SupabaseClient {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await db.query('truncate table public.api_rate_limits')
})

afterAll(async () => {
  await db?.end()
})

describe('distributed rate limit', () => {
  it('spends one allowance across two server instances', async () => {
    const a = instance() as never
    const b = instance() as never
    const { limit } = RATE_LIMITS.extra_check_request

    const verdicts = []
    for (let i = 0; i < limit; i += 1) {
      verdicts.push(await consumeRateLimit(i % 2 === 0 ? a : b, 'extra_check_request', 'user-1'))
    }

    expect(verdicts.every((verdict) => verdict.allowed)).toBe(true)
    expect(verdicts.at(-1)?.remaining).toBe(0)

    // One more, from either instance, is over the line.
    await expect(consumeRateLimit(b, 'extra_check_request', 'user-1')).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    })
  })

  it('checks below, at and above the limit', async () => {
    const client = instance() as never
    const { limit } = RATE_LIMITS.extra_check_request

    for (let i = 1; i < limit; i += 1) {
      await expect(consumeRateLimit(client, 'extra_check_request', 'user-2')).resolves.toMatchObject({
        allowed: true,
      })
    }

    // Exactly at the limit: still allowed, nothing left.
    await expect(consumeRateLimit(client, 'extra_check_request', 'user-2')).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    })

    // Above it: refused.
    await expect(consumeRateLimit(client, 'extra_check_request', 'user-2')).resolves.toMatchObject({
      allowed: false,
    })
  })

  it('keeps one subject’s traffic away from another’s', async () => {
    const client = instance() as never
    const { limit } = RATE_LIMITS.extra_check_request

    for (let i = 0; i <= limit; i += 1) {
      await consumeRateLimit(client, 'extra_check_request', 'noisy')
    }

    await expect(consumeRateLimit(client, 'extra_check_request', 'quiet')).resolves.toMatchObject({
      allowed: true,
    })
  })

  it('keeps one operation’s allowance away from another’s', async () => {
    const client = instance() as never
    const { limit } = RATE_LIMITS.extra_check_request

    for (let i = 0; i <= limit; i += 1) {
      await consumeRateLimit(client, 'extra_check_request', 'user-3')
    }

    await expect(consumeRateLimit(client, 'analysis_create', 'user-3')).resolves.toMatchObject({
      allowed: true,
    })
  })

  it('starts a new window on a controlled clock, without sleeping', async () => {
    const client = instance() as never
    const { limit, windowSeconds } = RATE_LIMITS.extra_check_request
    const start = new Date('2026-09-06T12:00:00.000Z')

    for (let i = 0; i <= limit; i += 1) {
      await consumeRateLimit(client, 'extra_check_request', 'user-4', start)
    }
    await expect(
      consumeRateLimit(client, 'extra_check_request', 'user-4', start),
    ).resolves.toMatchObject({ allowed: false })

    // One second before the window ends: still refused.
    const almost = new Date(start.getTime() + (windowSeconds - 1) * 1000)
    await expect(
      consumeRateLimit(client, 'extra_check_request', 'user-4', almost),
    ).resolves.toMatchObject({ allowed: false })

    // Once it has elapsed the allowance is back.
    const after = new Date(start.getTime() + (windowSeconds + 1) * 1000)
    await expect(
      consumeRateLimit(client, 'extra_check_request', 'user-4', after),
    ).resolves.toMatchObject({ allowed: true, remaining: limit - 1 })
  })

  it('counts every concurrent request exactly once', async () => {
    const client = instance() as never
    const attempts = 20

    const verdicts = await Promise.all(
      Array.from({ length: attempts }, () =>
        consumeRateLimit(client, 'analysis_create', 'user-5'),
      ),
    )

    const allowed = verdicts.filter((verdict) => verdict.allowed).length
    expect(allowed).toBe(RATE_LIMITS.analysis_create.limit)

    const { rows } = await db.query<{ request_count: number }>(
      `select request_count from public.api_rate_limits where bucket = 'analysis_create:user-5'`,
    )
    expect(rows[0].request_count).toBe(attempts)
  })

  it('is not reachable with a user token', async () => {
    const anon = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!)

    const { error } = await anon.rpc('consume_rate_limit', {
      p_bucket: 'analysis_create:someone',
      p_limit: 100,
      p_window_seconds: 60,
    })

    expect(error).not.toBeNull()
  })
})

describe('the analysis service refuses before it spends anything', () => {
  it('answers rate_limited without reserving a credit or calling the model', async () => {
    const { seedFixtures, connect: connectDb } = await import('./fixtures')
    const { analyzeSymptomCheck } = await import('@/server/symptom-check/analyze-symptom-check')
    const { RATE_LIMITS } = await import('@/server/api/rate-limit')

    const fixtureDb = await connectDb()
    const seeded = await seedFixtures(fixtureDb)
    const service = instance() as never

    const creditsBefore = (
      await fixtureDb.query<{ credits: number }>(
        `select credits from public.profiles where id = $1`,
        [seeded.ownerAId],
      )
    ).rows[0].credits

    for (let i = 0; i < RATE_LIMITS.analysis_create.limit; i += 1) {
      await consumeRateLimit(service, 'analysis_create', seeded.ownerAId)
    }

    const outcome = await analyzeSymptomCheck(service, {
      userId: seeded.ownerAId,
      symptoms: 'coughing for two days',
      petId: null,
      photos: [],
      appetite: null,
      activity: null,
      duration: null,
      stool: null,
      pain_signs: [],
    })

    expect(outcome).toMatchObject({ ok: false, code: 'rate_limited' })

    // No credit was reserved, so no compensation was needed either.
    const { rows } = await fixtureDb.query<{ credits: number; ledger: string }>(
      `select p.credits,
              (select count(*) from public.credit_ledger where user_id = p.id) as ledger
       from public.profiles p where p.id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].credits).toBe(creditsBefore)
    expect(rows[0].ledger).toBe('4')

    await fixtureDb.end()
  })
})
