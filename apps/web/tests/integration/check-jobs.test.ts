import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { CHECK_IDS, connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'
import { createCheckJob, getCheckJob, type Analyse } from '@/server/checks/check-job-service'

let db: Client
let fixtures: SeededFixtures

function service(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Stands in for the AI call: this file is about what happens around it. */
const succeeds =
  (checkId: string): Analyse =>
  async () => ({
    ok: true,
    result: {} as never,
    checkId,
    creditsRemaining: 4,
    hasPhoto: false,
    quickAssessment: {
      appetite: null,
      activity: null,
      duration: null,
      stool: null,
      pain_signs: [],
    },
  })

const fails: Analyse = async () => ({
  ok: false,
  code: 'dependency_unavailable',
  message: 'AI провайдер недоступен',
})

function request(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    idempotencyKey: null,
    pet_id: null,
    symptoms: 'вялый второй день',
    upload_ids: [],
    appetite: null,
    activity: null,
    duration: null,
    stool: null,
    pain_signs: [],
    ...overrides,
  } as Parameters<typeof createCheckJob>[1]
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  fixtures = await seedFixtures(db)
  await db.query('truncate table public.check_jobs')
})

afterAll(async () => {
  await db?.end()
})

describe('check jobs', () => {
  it('records a finished analysis against the check it produced', async () => {
    const supabase = service() as never

    const outcome = await createCheckJob(
      supabase,
      request(fixtures.ownerAId),
      succeeds(CHECK_IDS.aFirst),
    )

    expect(outcome).toMatchObject({ ok: true, reused: false })
    if (!outcome.ok) return

    const job = await getCheckJob(supabase, fixtures.ownerAId, outcome.jobId)
    expect(job).toMatchObject({
      status: 'completed',
      check_id: CHECK_IDS.aFirst,
      error_code: null,
    })
    // The contract is explicit that these are different identifiers.
    expect(job?.job_id).not.toBe(job?.check_id)
  })

  it('leaves a failure the client can branch on rather than a dead job', async () => {
    const supabase = service() as never

    const outcome = await createCheckJob(supabase, request(fixtures.ownerAId), fails)

    expect(outcome).toMatchObject({ ok: false, code: 'dependency_unavailable' })

    const { rows } = await db.query('select status, error_code, check_id from public.check_jobs')
    expect(rows).toEqual([
      { status: 'failed', error_code: 'dependency_unavailable', check_id: null },
    ])
  })

  it('answers a repeated request with the same job instead of analysing twice', async () => {
    const supabase = service() as never
    let calls = 0
    const counting: Analyse = async (...args) => {
      calls += 1
      return succeeds(CHECK_IDS.aFirst)(...args)
    }

    const first = await createCheckJob(
      supabase,
      request(fixtures.ownerAId, { idempotencyKey: 'retry-key-0001' }),
      counting,
    )
    const second = await createCheckJob(
      supabase,
      request(fixtures.ownerAId, { idempotencyKey: 'retry-key-0001' }),
      counting,
    )

    expect(first).toMatchObject({ ok: true, reused: false })
    expect(second).toMatchObject({ ok: true, reused: true })
    if (first.ok && second.ok) expect(second.jobId).toBe(first.jobId)
    // The point of the key: a retry must not cost a second credit.
    expect(calls).toBe(1)
  })

  it('treats the same key from a different person as a different request', async () => {
    const supabase = service() as never

    const a = await createCheckJob(
      supabase,
      request(fixtures.ownerAId, { idempotencyKey: 'shared-key-0001' }),
      succeeds(CHECK_IDS.aFirst),
    )
    const b = await createCheckJob(
      supabase,
      request(fixtures.ownerBId, { idempotencyKey: 'shared-key-0001' }),
      succeeds(CHECK_IDS.bOnly),
    )

    expect(a).toMatchObject({ ok: true })
    expect(b).toMatchObject({ ok: true, reused: false })
    if (a.ok && b.ok) expect(b.jobId).not.toBe(a.jobId)
  })

  it('hides a job belonging to someone else behind the answer for a missing one', async () => {
    const supabase = service() as never
    const mine = await createCheckJob(
      supabase,
      request(fixtures.ownerAId),
      succeeds(CHECK_IDS.aFirst),
    )
    if (!mine.ok) throw new Error('setup failed')

    await expect(getCheckJob(supabase, fixtures.ownerBId, mine.jobId)).resolves.toBeNull()
  })

  it('refuses uploads while photographs are switched off, before starting anything', async () => {
    const supabase = service() as never
    let calls = 0
    const counting: Analyse = async (...args) => {
      calls += 1
      return succeeds(CHECK_IDS.aFirst)(...args)
    }

    const outcome = await createCheckJob(
      supabase,
      request(fixtures.ownerAId, { upload_ids: [CHECK_IDS.aFirst] }),
      counting,
    )

    expect(outcome).toMatchObject({ ok: false, code: 'bad_request' })
    expect(calls).toBe(0)
    const { rows } = await db.query('select count(*)::int as n from public.check_jobs')
    expect(rows[0].n).toBe(0)
  })
})
