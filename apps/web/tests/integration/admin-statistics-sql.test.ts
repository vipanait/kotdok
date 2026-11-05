import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { connect, requestDeletion, seedFixtures } from './fixtures'

/**
 * The admin statistics, counted in SQL (docs/superpowers/specs/2026-11-05-admin-dashboard-design.md).
 *
 * Every function takes `p_now`, so the windows are fixed: NOW is midday
 * 5 November 2026 UTC, 15:00 in Moscow. The fixture's own checks are dated
 * May 2026, outside every window here.
 */

const NOW = '2026-11-05T12:00:00Z'

let db: Client
let ownerA: string
let ownerB: string

type Row = Record<string, unknown>

/** Fixture owners with known registration times: A on 20 October, B on 1 November. */
async function seedAdmin(client: Client): Promise<{ ownerA: string; ownerB: string }> {
  const seeded = await seedFixtures(client)
  await client.query(`update public.profiles set created_at = timestamp '2026-10-20 09:00' where id = $1`, [seeded.ownerAId])
  await client.query(`update public.profiles set created_at = timestamp '2026-11-01 09:00' where id = $1`, [seeded.ownerBId])
  return { ownerA: seeded.ownerAId, ownerB: seeded.ownerBId }
}

/** A check at `at` (UTC, as the zone-less column stores it). */
async function insertCheck(
  client: Client,
  {
    userId,
    petId = null,
    urgency = 'monitor',
    at,
    deleted = false,
    answers = {},
    symptoms = 'рвота дважды',
  }: { userId: string; petId?: string | null; urgency?: string; at: string; deleted?: boolean; answers?: Row; symptoms?: string },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into public.symptom_checks
       (user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes, home_care_steps, vet_questions, full_response, created_at, deleted_at)
     values ($1, $2, $6, $3, 'reason', array['cause'], array['step'], array['question'], $5::jsonb, $4::timestamp, case when $7 then now() end)
     returning id`,
    [userId, petId, urgency, at, JSON.stringify(answers), symptoms, deleted],
  )
  return rows[0]!.id
}

async function insertFeedback(
  client: Client,
  {
    userId,
    checkId = null,
    rating,
    comment = null,
    at,
    updatedAt = null,
  }: { userId: string; checkId?: string | null; rating: 'liked' | 'disliked'; comment?: string | null; at: string; updatedAt?: string | null },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into public.user_feedback (user_id, symptom_check_id, rating, comment, created_at, updated_at)
     values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz) returning id`,
    [userId, checkId, rating, comment, at, updatedAt],
  )
  return rows[0]!.id
}

async function insertJob(
  client: Client,
  { userId, status = 'completed', at, errorCode = null }: { userId: string; status?: string; at: string; errorCode?: string | null },
): Promise<void> {
  await client.query(
    `insert into public.check_jobs (user_id, status, error_code, created_at, updated_at) values ($1, $2, $3, $4::timestamptz, $4::timestamptz)`,
    [userId, status, errorCode, at],
  )
}

async function call(fn: string, days = 30, now = NOW): Promise<Row> {
  const { rows } = await db.query<{ r: Row }>(`select public.${fn}($1::timestamptz, $2) as r`, [now, days])
  return rows[0]!.r
}

function day(r: Row, date: string): Row {
  const found = (r.daily as Row[]).find((point) => point.date === date)
  if (!found) throw new Error(`no daily point for ${date}`)
  return found
}

/** Every admin function, called the way an outsider would try. */
const ADMIN_FUNCTIONS = [
  `admin_overview_stats(now(), 30)`,
  `admin_activity(now() - interval '1 day', now())`,
]

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  ;({ ownerA, ownerB } = await seedAdmin(db))
})

afterAll(async () => {
  await db?.end()
})

describe('admin_overview_stats', () => {
  it('counts more than 1000 checks', async () => {
    await db.query(
      `insert into public.symptom_checks (user_id, symptoms_input, urgency, created_at)
       select $1, 'x', 'monitor', timestamp '2026-11-04 10:00' from generate_series(1, 1200)`,
      [ownerA],
    )
    const r = await call('admin_overview_stats')
    expect((r.checks as Row).cur).toBe(1200)
  })

  it('puts a check made at 21:30 UTC on the next Moscow day', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-11-04 21:30' })
    const r = await call('admin_overview_stats')
    expect(day(r, '2026-11-05').checks).toBe(1)
    expect(day(r, '2026-11-04').checks).toBe(0)
  })

  it('has exactly p_days Moscow dates ending today', async () => {
    const r = await call('admin_overview_stats')
    const daily = r.daily as Row[]
    expect(daily).toHaveLength(30)
    expect(daily.at(-1)!.date).toBe('2026-11-05')
    expect(daily[0]!.date).toBe('2026-10-07')
  })

  it('gives null for prev when the source is younger than the previous window', async () => {
    await db.query(`delete from public.check_jobs`)
    await insertJob(db, { userId: ownerA, at: '2026-11-01T10:00:00Z' })
    const r = await call('admin_overview_stats')
    expect((r.failures as Row).prev).toBeNull()
    expect((r.failures as Row).cur).toEqual({ num: 0, den: 1 })
  })

  it('gives zero, not null, for prev when the source already existed', async () => {
    await db.query(`delete from public.check_jobs`)
    await insertJob(db, { userId: ownerA, at: '2026-01-01T10:00:00Z' })
    await insertJob(db, { userId: ownerA, at: '2026-11-01T10:00:00Z', status: 'failed', errorCode: 'analysis_failed' })
    const r = await call('admin_overview_stats')
    expect((r.failures as Row).prev).toEqual({ num: 0, den: 0 })
    expect((r.failures as Row).cur).toEqual({ num: 1, den: 1 })
  })

  it('compares windows of the same length', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-10-01 10:00' })
    await insertCheck(db, { userId: ownerA, at: '2026-10-01 11:00' })
    await insertCheck(db, { userId: ownerA, at: '2026-10-20 10:00' })
    const r = await call('admin_overview_stats')
    expect(r.checks).toEqual({ cur: 1, prev: 2 })
  })

  it('does not count accounts that are being deleted', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-11-03 10:00' })
    await insertCheck(db, { userId: ownerB, at: '2026-11-03 10:00' })
    await requestDeletion(db, ownerB)
    const r = await call('admin_overview_stats')
    expect((r.checks as Row).cur).toBe(1)
    expect((r.new_users as Row).cur).toBe(1)
    expect(day(r, '2026-11-01').registrations).toBe(0)
  })

  it('counts soft-deleted checks', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-11-03 10:00', deleted: true })
    const r = await call('admin_overview_stats')
    expect((r.checks as Row).cur).toBe(1)
  })

  it('counts people active in the last seven days by any record, once each', async () => {
    const check = await insertCheck(db, { userId: ownerA, at: '2026-11-04 10:00' })
    await insertCheck(db, { userId: ownerA, at: '2026-11-03 10:00' })
    await insertFeedback(db, { userId: ownerB, checkId: check, rating: 'liked', at: '2026-11-04T11:00:00Z' })
    await insertCheck(db, { userId: ownerA, at: '2026-10-27 10:00' })
    const r = await call('admin_overview_stats')
    expect(r.active_7d).toEqual({ cur: 2, prev: 1 })
  })

  it('counts helpful answers by the time the rating was last given', async () => {
    const first = await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00' })
    const second = await insertCheck(db, { userId: ownerA, at: '2026-11-01 11:00' })
    const old = await insertCheck(db, { userId: ownerA, at: '2026-09-01 11:00' })
    await insertFeedback(db, { userId: ownerA, checkId: first, rating: 'liked', at: '2026-11-02T10:00:00Z' })
    await insertFeedback(db, { userId: ownerA, checkId: second, rating: 'disliked', at: '2026-11-02T10:00:00Z' })
    await insertFeedback(db, { userId: ownerA, checkId: old, rating: 'liked', at: '2026-09-02T10:00:00Z', updatedAt: '2026-11-03T10:00:00Z' })
    const r = await call('admin_overview_stats')
    expect((r.helpful as Row).cur).toEqual({ num: 2, den: 3 })
  })

  it('counts requests for an extra check', async () => {
    await db.query(
      `insert into public.extra_check_requests (user_id, status, created_at) values ($1, 'pending', timestamptz '2026-11-02 10:00+00')`,
      [ownerA],
    )
    const r = await call('admin_overview_stats')
    expect((r.extra_requests as Row).cur).toBe(1)
  })
})

describe('access', () => {
  it.each(ADMIN_FUNCTIONS)('denies %s to authenticated', async (expression) => {
    await db.query('begin')
    try {
      await db.query('set local role authenticated')
      await expect(db.query(`select * from public.${expression}`)).rejects.toThrow(/permission denied/)
    } finally {
      await db.query('rollback')
    }
  })
})
