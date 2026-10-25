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

  it('tells the analysis which job it runs for, so the credit it reserves belongs to that job', async () => {
    const supabase = service() as never
    let seen: string | undefined
    const watching: Analyse = async (client, input) => {
      seen = input.jobId
      return succeeds(CHECK_IDS.aFirst)(client, input)
    }

    const outcome = await createCheckJob(supabase, request(fixtures.ownerAId), watching)

    if (!outcome.ok) throw new Error('setup failed')
    expect(seen).toBe(outcome.jobId)
  })
})

describe('a job whose analysis died', () => {
  const STALE = "now() - interval '6 minutes'"

  async function processingJob(userId: string): Promise<string> {
    const { rows } = await db.query(
      `insert into public.check_jobs (user_id, status) values ($1, 'processing') returning id`,
      [userId],
    )
    return rows[0].id as string
  }

  async function credits(userId: string): Promise<number> {
    const { rows } = await db.query('select credits from public.profiles where id = $1', [userId])
    return rows[0].credits as number
  }

  it('reserves the credit and records it on the job in one step', async () => {
    const supabase = service()
    const before = await credits(fixtures.ownerAId)
    const jobId = await processingJob(fixtures.ownerAId)

    const { data, error } = await supabase.rpc('reserve_check_job_credit', { p_user_id: fixtures.ownerAId, p_job_id: jobId })

    expect(error).toBeNull()
    expect(await credits(fixtures.ownerAId)).toBe(before - 1)
    const { rows } = await db.query('select usage_ledger_id from public.check_jobs where id = $1', [jobId])
    expect(rows[0].usage_ledger_id).toBe((data as { ledger_id: string }).ledger_id)
  })

  it('gives its credit back once, however many polls find it at the same time', async () => {
    const supabase = service()
    const before = await credits(fixtures.ownerAId)
    const jobId = await processingJob(fixtures.ownerAId)
    await supabase.rpc('reserve_check_job_credit', { p_user_id: fixtures.ownerAId, p_job_id: jobId })
    await db.query(`update public.check_jobs set updated_at = ${STALE} where id = $1`, [jobId])

    const reads = await Promise.all([1, 2, 3].map(() => getCheckJob(supabase as never, fixtures.ownerAId, jobId)))
    const again = await getCheckJob(supabase as never, fixtures.ownerAId, jobId)

    for (const read of [...reads, again]) expect(read).toMatchObject({ status: 'failed', error_code: 'internal_error' })
    expect(await credits(fixtures.ownerAId)).toBe(before)
    const { rows } = await db.query(
      `select count(*)::int as refunds from public.credit_ledger where user_id = $1 and reason = 'refund'`,
      [fixtures.ownerAId],
    )
    expect(rows[0].refunds).toBe(1)
  })

  it('closes a dead job that never reserved a credit without giving one', async () => {
    const supabase = service()
    const before = await credits(fixtures.ownerAId)
    const jobId = await processingJob(fixtures.ownerAId)
    await db.query(`update public.check_jobs set updated_at = ${STALE} where id = $1`, [jobId])

    const read = await getCheckJob(supabase as never, fixtures.ownerAId, jobId)

    expect(read).toMatchObject({ status: 'failed', error_code: 'internal_error' })
    expect(await credits(fixtures.ownerAId)).toBe(before)
    const { rows } = await db.query('select status from public.check_jobs where id = $1', [jobId])
    expect(rows[0].status).toBe('failed')
  })

  it('leaves a job that is still within its time alone', async () => {
    const supabase = service()
    const jobId = await processingJob(fixtures.ownerAId)
    await supabase.rpc('reserve_check_job_credit', { p_user_id: fixtures.ownerAId, p_job_id: jobId })

    const read = await getCheckJob(supabase as never, fixtures.ownerAId, jobId)

    expect(read).toMatchObject({ status: 'processing' })
    const { rows } = await db.query('select status from public.check_jobs where id = $1', [jobId])
    expect(rows[0].status).toBe('processing')
  })

  it('never closes someone else’s job', async () => {
    const supabase = service()
    const jobId = await processingJob(fixtures.ownerAId)
    await db.query(`update public.check_jobs set updated_at = ${STALE} where id = $1`, [jobId])

    const { data } = await supabase.rpc('fail_stale_check_job', {
      p_user_id: fixtures.ownerBId,
      p_job_id: jobId,
      p_stale_after_seconds: 300,
    })

    expect(data).toBeNull()
    const { rows } = await db.query('select status from public.check_jobs where id = $1', [jobId])
    expect(rows[0].status).toBe('processing')
  })
})
