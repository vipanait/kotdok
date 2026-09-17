import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 8/05, the database half: the functions the deletion worker calls.
 *
 * Every check counts real rows. A function that returns without raising has
 * proved nothing about what it removed.
 */

let db: Client
let seeded: SeededFixtures

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  // The fixture reset truncates the business tables but not these: jobs and
  // archive rows have no foreign key to the users it removes.
  await db.query('delete from public.deletion_jobs')
  await db.query('delete from public.financial_archive')
})

afterAll(async () => {
  await db.end()
})

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql, params)
  return Number(rows[0].n)
}

/** A job exactly as `request_account_deletion` leaves it. */
async function requestDeletion(userId: string): Promise<void> {
  await db.query(`select public.request_account_deletion($1, $2)`, [userId, `receipt-${userId}`])
}

/** Everything the fixtures do not seed but a real, long-lived account can have. */
async function addTheRest(userId: string): Promise<void> {
  // check_jobs.check_id cascades from symptom_checks, but a job is still its
  // own row until that happens, and check_jobs has no other link that would
  // free it on its own.
  await db.query(
    `insert into public.check_jobs (user_id, status, check_id)
     select $1, 'completed', id from public.symptom_checks where user_id = $1 limit 1`,
    [userId],
  )
  await db.query(
    `insert into public.extra_check_requests (user_id, granted_ledger_id)
     select $1, id from public.credit_ledger where user_id = $1 order by created_at limit 1`,
    [userId],
  )
  await db.query(`insert into public.user_feedback (user_id, rating, comment) values ($1, 'liked', 'fine')`, [
    userId,
  ])
  const { rows: pkg } = await db.query<{ id: string }>(
    `insert into retired.packages (code, name, units, unit_price, amount)
     values ('legacy-' || gen_random_uuid(), 'Legacy', 5, 100, 500) returning id`,
  )
  const { rows: tx } = await db.query<{ id: string }>(
    `insert into retired.transactions (user_id, provider, package_id, units_total, unit_price, amount, currency)
     values ($1, 'dummy', $2, 5, 100, 500, 'RUB') returning id`,
    [userId, pkg[0].id],
  )
  await db.query(
    `insert into retired.transaction_status_events (transaction_id, status) values ($1, 'created'), ($1, 'succeeded')`,
    [tx[0].id],
  )
  await db.query(`insert into retired.credit_transactions (user_id, amount, type) values ($1, 3, 'purchase')`, [
    userId,
  ])
}

async function rowsOf(userId: string): Promise<Record<string, number>> {
  return {
    profiles: await count(`select count(*) n from public.profiles where id = $1`, [userId]),
    pets: await count(`select count(*) n from public.pets where user_id = $1`, [userId]),
    checks: await count(`select count(*) n from public.symptom_checks where user_id = $1`, [userId]),
    jobs: await count(`select count(*) n from public.check_jobs where user_id = $1`, [userId]),
    ledger: await count(`select count(*) n from public.credit_ledger where user_id = $1`, [userId]),
    extra: await count(`select count(*) n from public.extra_check_requests where user_id = $1`, [userId]),
    feedback: await count(`select count(*) n from public.user_feedback where user_id = $1`, [userId]),
    transactions: await count(`select count(*) n from retired.transactions where user_id = $1`, [userId]),
    creditTransactions: await count(`select count(*) n from retired.credit_transactions where user_id = $1`, [
      userId,
    ]),
  }
}

describe('delete_account_data', () => {
  it('removes every row of a long-lived account and archives the money', async () => {
    await addTheRest(seeded.ownerAId)
    await requestDeletion(seeded.ownerAId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])

    expect(await rowsOf(seeded.ownerAId)).toEqual({
      profiles: 0,
      pets: 0,
      checks: 0,
      jobs: 0,
      ledger: 0,
      extra: 0,
      feedback: 0,
      transactions: 0,
      creditTransactions: 0,
    })
    const { rows } = await db.query<{ source: string; n: string }>(
      `select source, count(*) n from public.financial_archive where subject_ref = $1 group by source order by source`,
      [seeded.ownerAId],
    )
    expect(rows.map((row) => [row.source, Number(row.n)])).toEqual([
      ['credit_ledger', 4],
      ['credit_transactions', 1],
      ['transaction_status_events', 2],
      ['transactions', 1],
    ])
    // The Auth user is the worker's next step, not this function's.
    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(1)
    await db.query(`delete from auth.users where id = $1`, [seeded.ownerAId])
  })

  it('leaves the other owner untouched, soft-deleted pet included', async () => {
    const before = await rowsOf(seeded.ownerBId)
    await addTheRest(seeded.ownerAId)
    await requestDeletion(seeded.ownerAId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])

    expect(await rowsOf(seeded.ownerBId)).toEqual(before)
  })

  it('removes soft-deleted pets and checks too', async () => {
    await requestDeletion(seeded.ownerBId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerBId])

    expect(await count(`select count(*) n from public.pets where user_id = $1`, [seeded.ownerBId])).toBe(0)
    expect(await count(`select count(*) n from public.symptom_checks where user_id = $1`, [seeded.ownerBId])).toBe(0)
  })

  it('can run twice without failing or archiving twice', async () => {
    await addTheRest(seeded.ownerAId)
    await requestDeletion(seeded.ownerAId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])
    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])

    expect(await count(`select count(*) n from public.financial_archive where subject_ref = $1`, [seeded.ownerAId])).toBe(8)
  })
})

describe('the job lifecycle functions', () => {
  it('claims a pending job once and reports its progress', async () => {
    await requestDeletion(seeded.ownerAId)

    const first = await db.query<{ p: unknown }>(`select public.claim_deletion_job($1, 120) p`, [seeded.ownerAId])
    const second = await db.query<{ p: unknown }>(`select public.claim_deletion_job($1, 120) p`, [seeded.ownerAId])

    expect(first.rows[0].p).toEqual({})
    expect(second.rows[0].p).toBeNull()
    const { rows } = await db.query(`select status, lease_until > now() leased from public.deletion_jobs where user_id = $1`, [
      seeded.ownerAId,
    ])
    expect(rows[0]).toEqual({ status: 'in_progress', leased: true })
  })

  it('lets a job be claimed again once its lease has run out', async () => {
    await requestDeletion(seeded.ownerAId)
    await db.query(`select public.claim_deletion_job($1, 120)`, [seeded.ownerAId])
    await db.query(`update public.deletion_jobs set lease_until = now() - interval '1 second' where user_id = $1`, [
      seeded.ownerAId,
    ])

    const again = await db.query<{ p: unknown }>(`select public.claim_deletion_job($1, 120) p`, [seeded.ownerAId])

    expect(again.rows[0].p).toEqual({})
  })

  it('records steps in progress', async () => {
    await requestDeletion(seeded.ownerAId)
    await db.query(`select public.mark_deletion_step($1, 'data')`, [seeded.ownerAId])

    const { rows } = await db.query<{ progress: Record<string, string> }>(
      `select progress from public.deletion_jobs where user_id = $1`,
      [seeded.ownerAId],
    )
    expect(Object.keys(rows[0].progress)).toEqual(['data'])
  })

  it('refuses a step name it does not know', async () => {
    await requestDeletion(seeded.ownerAId)

    await expect(db.query(`select public.mark_deletion_step($1, 'storage')`, [seeded.ownerAId])).rejects.toThrow()
  })

  it('counts failures, frees the lease, and gives up after the limit', async () => {
    await requestDeletion(seeded.ownerAId)
    const statuses: string[] = []

    for (let attempt = 0; attempt < 5; attempt++) {
      await db.query(`select public.claim_deletion_job($1, 120)`, [seeded.ownerAId])
      const { rows } = await db.query<{ s: string }>(`select public.record_deletion_failure($1, 'data_step_failed', 5) s`, [
        seeded.ownerAId,
      ])
      statuses.push(rows[0].s)
    }

    expect(statuses).toEqual(['in_progress', 'in_progress', 'in_progress', 'in_progress', 'action_required'])
    const { rows } = await db.query(`select attempts, error_code, lease_until from public.deletion_jobs where user_id = $1`, [
      seeded.ownerAId,
    ])
    expect(rows[0]).toEqual({ attempts: 5, error_code: 'data_step_failed', lease_until: null })
    const claim = await db.query<{ p: unknown }>(`select public.claim_deletion_job($1, 120) p`, [seeded.ownerAId])
    expect(claim.rows[0].p).toBeNull()
  })

  it('lists due jobs oldest first and skips leased, finished and abandoned ones', async () => {
    await requestDeletion(seeded.ownerAId)
    await requestDeletion(seeded.ownerBId)
    await db.query(`update public.deletion_jobs set requested_at = now() - interval '1 hour' where user_id = $1`, [
      seeded.ownerBId,
    ])

    const both = await db.query<{ id: string }>(`select public.due_deletion_jobs(20) id`)
    expect(both.rows.map((row) => row.id)).toEqual([seeded.ownerBId, seeded.ownerAId])

    await db.query(`select public.claim_deletion_job($1, 120)`, [seeded.ownerBId])
    const leased = await db.query<{ id: string }>(`select public.due_deletion_jobs(20) id`)
    expect(leased.rows.map((row) => row.id)).toEqual([seeded.ownerAId])
  })

  it('is callable by the service role only', async () => {
    const { rows } = await db.query<{ proname: string; anon: boolean; authed: boolean; service: boolean }>(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'execute') anon,
              has_function_privilege('authenticated', p.oid, 'execute') authed,
              has_function_privilege('service_role', p.oid, 'execute') service
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('claim_deletion_job', 'mark_deletion_step', 'record_deletion_failure', 'due_deletion_jobs', 'delete_account_data')
       order by p.proname`,
    )
    expect(rows).toEqual([
      { proname: 'claim_deletion_job', anon: false, authed: false, service: true },
      { proname: 'delete_account_data', anon: false, authed: false, service: true },
      { proname: 'due_deletion_jobs', anon: false, authed: false, service: true },
      { proname: 'mark_deletion_step', anon: false, authed: false, service: true },
      { proname: 'record_deletion_failure', anon: false, authed: false, service: true },
    ])
  })
})
