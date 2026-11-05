import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { PET_IDS, connect, requestDeletion, seedFixtures } from './fixtures'

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

/** The synthetic people of the load test, with their checks. */
async function removeLoadUsers(): Promise<void> {
  await db.query(
    `delete from public.symptom_checks where user_id in (select id from auth.users where email like 'load-%@fixture.local')`,
  )
  await db.query(`delete from public.profiles where id in (select id from auth.users where email like 'load-%@fixture.local')`)
  await db.query(`delete from auth.users where email like 'load-%@fixture.local'`)
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
  `admin_users_stats(now(), 30)`,
  `admin_checks_stats(now(), 30)`,
  `admin_check_feed(now(), 30, 'all', 50)`,
  `admin_check_row(null::public.symptom_checks)`,
  `admin_feedback_stats(now(), 30)`,
  `admin_feedback_feed(now(), 30, 'all', 50)`,
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

describe('admin_users_stats', () => {
  it('counts active accounts and the ones added in the period', async () => {
    let r = await call('admin_users_stats')
    expect(r.accounts).toEqual({ total: 2, added: 2 })
    await requestDeletion(db, ownerB)
    r = await call('admin_users_stats')
    expect(r.accounts).toEqual({ total: 1, added: 1 })
  })

  it('counts activation only for registrations at least seven days old', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-10-22 10:00' })
    await insertCheck(db, { userId: ownerB, at: '2026-11-02 10:00' })
    const r = await call('admin_users_stats')
    expect((r.activation as Row).cur).toEqual({ num: 1, den: 1 })
  })

  it('does not count a first check made after the seven days', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-10-28 10:00' })
    const r = await call('admin_users_stats')
    expect((r.activation as Row).cur).toEqual({ num: 0, den: 1 })
  })

  it('counts returns as people with a second check', async () => {
    // The fixture gives B two checks in May (the ledger holds on to them); this
    // case needs B with one, so they move to A, who returns either way.
    await db.query(`update public.symptom_checks set user_id = $1 where user_id = $2`, [ownerA, ownerB])
    await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00' })
    await insertCheck(db, { userId: ownerA, at: '2026-11-02 10:00' })
    await insertCheck(db, { userId: ownerB, at: '2026-11-02 10:00' })
    const r = await call('admin_users_stats')
    expect((r.returning as Row).cur).toEqual({ num: 1, den: 2 })
  })

  it('averages daily active people over the days of the period', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00' })
    await insertCheck(db, { userId: ownerA, at: '2026-11-01 12:00' })
    await insertCheck(db, { userId: ownerA, at: '2026-11-02 10:00' })
    await insertCheck(db, { userId: ownerB, at: '2026-11-02 10:00' })
    const r = await call('admin_users_stats')
    expect((r.dau_avg as Row).cur).toBeCloseTo(3 / 30, 5)
    expect(day(r, '2026-11-02').active).toBe(2)
    expect(day(r, '2026-11-01').registrations).toBe(1)
  })

  it('counts the sign-in method by the earliest identity, and the language', async () => {
    await db.query(
      `insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
       values ('apple-sub-a', $1, '{"sub": "apple-sub-a"}'::jsonb, 'apple', timestamptz '2026-01-01 00:00+00', timestamptz '2026-01-01 00:00+00')`,
      [ownerA],
    )
    const r = await call('admin_users_stats')
    expect(r.providers).toEqual({ apple: 1, email: 1 })
    expect(r.locales).toEqual({ ru: 1, en: 1 })
  })

  it('counts activation over registrations that have had their seven days, even for a seven-day period', async () => {
    await db.query(`update public.profiles set created_at = timestamp '2026-10-25 09:00' where id = $1`, [ownerB])
    await insertCheck(db, { userId: ownerB, at: '2026-10-26 10:00' })
    const r = await call('admin_users_stats', 7)
    expect((r.activation as Row).cur).toEqual({ num: 1, den: 1 })
  })

  it('stays fast with thousands of people and tens of thousands of checks', async () => {
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
       select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
              'load-' || n || '@fixture.local', now(), now()
       from generate_series(1, 3000) n`,
    )
    await db.query(
      `update public.profiles p set created_at = timestamp '2026-11-05 00:00' - (random() * interval '120 days')
       from auth.users u where u.id = p.id and u.email like 'load-%'`,
    )
    await db.query(
      `insert into public.symptom_checks (user_id, symptoms_input, urgency, created_at)
       select p.id, 'x', 'monitor', timestamp '2026-11-05 00:00' - (random() * interval '120 days')
       from public.profiles p join auth.users u on u.id = p.id and u.email like 'load-%'
       cross join generate_series(1, 10)`,
    )
    try {
      const started = Date.now()
      await call('admin_users_stats', 90)
      expect(Date.now() - started).toBeLessThan(2000)
    } finally {
      // The fixture reset deletes auth users one by one through the API; 3000 of them would outlast its timeout.
      await removeLoadUsers()
    }
  })

  it('builds eight weekly cohorts and leaves unfinished weeks empty', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-10-22 10:00' })
    const r = await call('admin_users_stats')
    const cohorts = r.cohorts as Row[]
    expect(cohorts).toHaveLength(8)
    expect(cohorts[0]).toEqual({ week_start: '2026-09-14', size: 0, active: [0, 0, 0, 0, 0] })
    expect(cohorts.find((c) => c.week_start === '2026-10-19')).toEqual({ week_start: '2026-10-19', size: 1, active: [1, 0, null, null, null] })
    // B registered on Sunday 1 November: the week of 26 October, which has ended.
    expect(cohorts.find((c) => c.week_start === '2026-10-26')).toEqual({ week_start: '2026-10-26', size: 1, active: [0, null, null, null, null] })
    expect(cohorts.at(-1)).toEqual({ week_start: '2026-11-02', size: 0, active: [null, null, null, null, null] })
  })
})

async function feed(fn: string, filter: string, limit: number): Promise<{ rows: Row[]; has_more: boolean }> {
  const { rows } = await db.query<{ r: { rows: Row[]; has_more: boolean } }>(
    `select public.${fn}($1::timestamptz, 30, $2, $3) as r`,
    [NOW, filter, limit],
  )
  return rows[0]!.r
}

describe('admin_checks_stats', () => {
  it('splits checks by species, with unknown for a check without a pet', async () => {
    await insertCheck(db, { userId: ownerA, petId: PET_IDS.aCat, at: '2026-11-01 10:00' })
    await insertCheck(db, { userId: ownerA, petId: PET_IDS.aDog, at: '2026-11-01 10:00' })
    await insertCheck(db, { userId: ownerA, petId: null, at: '2026-11-01 10:00' })
    const r = await call('admin_checks_stats')
    expect(r.species).toEqual({ cat: 1, dog: 1, unknown: 1 })
    expect((r.per_user as Row).cur).toEqual({ num: 3, den: 1 })
  })

  it('counts every questionnaire answer, unanswered included', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00' })
    await insertCheck(db, {
      userId: ownerA,
      at: '2026-11-01 11:00',
      answers: { appetite: 'none', activity: 'lethargic', duration: '2-3days', stool: 'bloody', pain_signs: ['tense', 'hiding'] },
    })
    const answers = (await call('admin_checks_stats')).answers as Record<string, Row>
    expect(answers.total).toBe(2)
    expect(answers.appetite).toEqual({ normal: 0, reduced: 0, none: 1, unanswered: 1 })
    expect(answers.duration).toEqual({ today: 0, '2-3days': 1, '4-7days': 0, 'week+': 0, unanswered: 1 })
    expect(answers.pain).toEqual({ tense: 1, hunched: 0, grimace: 0, touch_sensitive: 0, hiding: 1, vocalizing: 0, any: 1 })
  })

  it('splits checks by urgency per Moscow day', async () => {
    await insertCheck(db, { userId: ownerA, urgency: 'urgent', at: '2026-11-04 21:30' })
    await insertCheck(db, { userId: ownerA, urgency: 'healthy', at: '2026-11-05 08:00' })
    const r = await call('admin_checks_stats')
    expect(day(r, '2026-11-05')).toEqual({ date: '2026-11-05', emergency: 0, urgent: 1, monitor: 0, home_care: 0, healthy: 1 })
  })

  it('counts failures by code and approved extra checks', async () => {
    await insertJob(db, { userId: ownerA, at: '2026-11-01T10:00:00Z', status: 'failed', errorCode: 'analysis_failed' })
    await insertJob(db, { userId: ownerA, at: '2026-11-01T11:00:00Z', status: 'failed', errorCode: 'analysis_failed' })
    await insertJob(db, { userId: ownerA, at: '2026-11-01T12:00:00Z' })
    await db.query(
      `insert into public.extra_check_requests (user_id, status, created_at)
       values ($1, 'approved', timestamptz '2026-11-02 10:00+00'), ($1, 'rejected', timestamptz '2026-11-02 11:00+00')`,
      [ownerA],
    )
    const r = await call('admin_checks_stats')
    expect((r.failures as Row).cur).toEqual({ num: 2, den: 3 })
    expect(r.failure_codes).toEqual({ analysis_failed: 2 })
    expect((r.extra_requests as Row).cur).toBe(2)
    expect(r.extra_approved).toBe(1)
  })
})

describe('admin_check_feed', () => {
  it('shows the newest checks first, without deleted ones', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00', symptoms: 'old' })
    await insertCheck(db, { userId: ownerA, at: '2026-11-03 10:00', symptoms: 'new' })
    await insertCheck(db, { userId: ownerA, at: '2026-11-04 10:00', symptoms: 'gone', deleted: true })
    const r = await feed('admin_check_feed', 'all', 50)
    expect(r.rows.map((row) => row.symptoms)).toEqual(['new', 'old'])
    expect(r.has_more).toBe(false)
  })

  it('filters urgent and disliked checks', async () => {
    await insertCheck(db, { userId: ownerA, urgency: 'emergency', at: '2026-11-01 10:00', symptoms: 'emergency' })
    await insertCheck(db, { userId: ownerA, urgency: 'urgent', at: '2026-11-01 11:00', symptoms: 'urgent' })
    const calm = await insertCheck(db, { userId: ownerA, urgency: 'monitor', at: '2026-11-01 12:00', symptoms: 'calm' })
    await insertFeedback(db, { userId: ownerA, checkId: calm, rating: 'disliked', comment: 'не помогло', at: '2026-11-02T10:00:00Z' })
    expect((await feed('admin_check_feed', 'urgent', 50)).rows.map((row) => row.symptoms)).toEqual(['urgent', 'emergency'])
    const disliked = await feed('admin_check_feed', 'disliked', 50)
    expect(disliked.rows.map((row) => row.symptoms)).toEqual(['calm'])
    expect(disliked.rows[0]).toMatchObject({ rating: 'disliked', comment: 'не помогло' })
  })

  it('treats an unknown filter as all', async () => {
    await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00' })
    expect((await feed('admin_check_feed', '<script>', 50)).rows).toHaveLength(1)
  })

  it('reports has_more and clamps the limit', async () => {
    for (const at of ['2026-11-01 10:00', '2026-11-01 11:00', '2026-11-01 12:00']) await insertCheck(db, { userId: ownerA, at })
    const two = await feed('admin_check_feed', 'all', 2)
    expect(two.rows).toHaveLength(2)
    expect(two.has_more).toBe(true)
    expect((await feed('admin_check_feed', 'all', 9999)).rows).toHaveLength(3)
    expect((await feed('admin_check_feed', 'all', 0)).rows).toHaveLength(1)
  })

  it('carries the pet species and age but nothing that identifies the owner', async () => {
    await db.query(`update public.pets set birth_date = date '2023-06-01', age_years = 9 where id = $1`, [PET_IDS.aCat])
    await insertCheck(db, {
      userId: ownerA,
      petId: PET_IDS.aCat,
      at: '2026-11-01 10:00',
      answers: { appetite: 'reduced', pain_signs: ['grimace'] },
    })
    const [row] = (await feed('admin_check_feed', 'all', 50)).rows
    expect(row).toMatchObject({
      species: 'cat',
      pet_age_years: 3,
      urgency: 'monitor',
      possible_causes: ['cause'],
      answers: { appetite: 'reduced', activity: null, duration: null, stool: null, pain_signs: ['grimace'] },
      rating: null,
      comment: null,
    })
    expect(Object.keys(row!)).not.toEqual(expect.arrayContaining(['user_id']))
    expect(JSON.stringify(row)).not.toContain(ownerA)
    expect(JSON.stringify(row)).not.toContain('Мурка')
  })
})

describe('admin_feedback_stats', () => {
  it('counts a changed rating at the time it was changed', async () => {
    const check = await insertCheck(db, { userId: ownerA, at: '2026-09-20 10:00' })
    await insertFeedback(db, { userId: ownerA, checkId: check, rating: 'liked', at: '2026-09-26T10:00:00Z', updatedAt: '2026-11-03T10:00:00Z' })
    const r = await call('admin_feedback_stats')
    // The only rating was first given on 26 September, after the previous window began.
    expect(r.ratings).toEqual({ cur: 1, prev: null })
    expect((r.liked as Row).cur).toEqual({ num: 1, den: 1 })
  })

  it('counts the share of checks with a rating, comments and daily ratings', async () => {
    const rated = await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00' })
    await insertCheck(db, { userId: ownerA, at: '2026-11-01 11:00' })
    await insertFeedback(db, { userId: ownerA, checkId: rated, rating: 'disliked', comment: 'мимо', at: '2026-11-04T21:30:00Z' })
    await insertFeedback(db, { userId: ownerB, rating: 'liked', comment: '   ', at: '2026-11-02T10:00:00Z' })
    const r = await call('admin_feedback_stats')
    expect((r.rated_checks as Row).cur).toEqual({ num: 1, den: 2 })
    expect((r.with_comment as Row).cur).toBe(1)
    expect(day(r, '2026-11-05')).toEqual({ date: '2026-11-05', liked: 0, disliked: 1 })
  })

  it('has no previous share of rated checks before ratings could be tied to a check', async () => {
    // An old product-level rating makes user_feedback older than the window; ratings
    // tied to a check only began on 1 November here, after the previous window.
    await insertFeedback(db, { userId: ownerB, rating: 'liked', at: '2026-06-01T10:00:00Z' })
    const check = await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00' })
    await insertCheck(db, { userId: ownerA, at: '2026-09-20 10:00' })
    await insertFeedback(db, { userId: ownerA, checkId: check, rating: 'liked', at: '2026-11-01T11:00:00Z' })
    const r = await call('admin_feedback_stats')
    expect((r.rated_checks as Row).cur).toEqual({ num: 1, den: 1 })
    expect((r.rated_checks as Row).prev).toBeNull()
  })

  it('splits ratings by urgency only for ratings tied to a check', async () => {
    const urgent = await insertCheck(db, { userId: ownerA, urgency: 'urgent', at: '2026-11-01 10:00' })
    await insertFeedback(db, { userId: ownerA, checkId: urgent, rating: 'liked', at: '2026-11-02T10:00:00Z' })
    await insertFeedback(db, { userId: ownerB, rating: 'disliked', at: '2026-11-02T10:00:00Z' })
    const r = await call('admin_feedback_stats')
    expect((r.ratings as Row).cur).toBe(2)
    expect((r.by_urgency as Row).urgent).toEqual({ liked: 1, rated: 1 })
    expect((r.by_urgency as Row).monitor).toEqual({ liked: 0, rated: 0 })
  })
})

describe('admin_feedback_feed', () => {
  it('lists non-empty comments newest first, with their check', async () => {
    const check = await insertCheck(db, { userId: ownerA, urgency: 'urgent', at: '2026-11-01 10:00', symptoms: 'хромает' })
    await insertFeedback(db, { userId: ownerA, checkId: check, rating: 'disliked', comment: 'не то', at: '2026-11-03T10:00:00Z' })
    await insertFeedback(db, { userId: ownerB, rating: 'liked', comment: 'спасибо', at: '2026-11-02T10:00:00Z' })
    await insertFeedback(db, { userId: ownerB, rating: 'liked', comment: '   ', at: '2026-11-04T10:00:00Z' })
    const r = await feed('admin_feedback_feed', 'all', 50)
    expect(r.rows.map((row) => row.comment)).toEqual(['не то', 'спасибо'])
    expect((r.rows[0]!.check as Row)).toMatchObject({ urgency: 'urgent', symptoms: 'хромает' })
    expect(r.rows[1]!.check).toBeNull()
  })

  it('filters by rating and hides the check of a deleted check', async () => {
    const gone = await insertCheck(db, { userId: ownerA, at: '2026-11-01 10:00', deleted: true })
    await insertFeedback(db, { userId: ownerA, checkId: gone, rating: 'disliked', comment: 'плохо', at: '2026-11-03T10:00:00Z' })
    await insertFeedback(db, { userId: ownerB, rating: 'liked', comment: 'хорошо', at: '2026-11-02T10:00:00Z' })
    const disliked = await feed('admin_feedback_feed', 'disliked', 50)
    expect(disliked.rows.map((row) => row.comment)).toEqual(['плохо'])
    expect(disliked.rows[0]!.check).toBeNull()
    expect((await feed('admin_feedback_feed', 'liked', 50)).rows.map((row) => row.comment)).toEqual(['хорошо'])
  })

  it('reports has_more', async () => {
    for (const at of ['2026-11-01T10:00:00Z', '2026-11-02T10:00:00Z']) {
      await insertFeedback(db, { userId: ownerB, rating: 'liked', comment: at, at })
    }
    const one = await feed('admin_feedback_feed', 'all', 1)
    expect(one.rows).toHaveLength(1)
    expect(one.has_more).toBe(true)
  })
})

describe('access', () => {
  it.each(ADMIN_FUNCTIONS)('denies %s to authenticated', async (expression) => {
    await db.query('begin')
    try {
      await db.query('set local role authenticated')
      await expect(db.query(`select public.${expression}`)).rejects.toThrow(/permission denied/)
    } finally {
      await db.query('rollback')
    }
  })
})
