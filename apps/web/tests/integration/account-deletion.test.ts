import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { OWNER_A, connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 8/02: an account can be deleted even though it has paid us.
 *
 * `transactions.user_id` and `credit_ledger.user_id` are `ON DELETE RESTRICT`,
 * so deleting a user who ever bought anything fails outright. The archive is
 * what unblocks it without discarding the bookkeeping — see
 * `docs/architecture/deletion-data-map.md` for what goes where and why.
 *
 * The order below is not a preference. `credit_ledger` points at both
 * `symptom_checks` and `transactions`, so it has to leave before either of
 * them; the map derives the whole order from `pg_constraint` rather than from
 * reading the migrations, which had renamed a table under our feet.
 */

let db: Client
let seeded: SeededFixtures

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
})

afterAll(async () => {
  await db.end()
})

async function count(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql, params)
  return Number(rows[0].n)
}

/** Everything the fixtures do not seed but a real account would have. */
async function addTheRest(userId: string): Promise<void> {
  await db.query(
    `insert into public.extra_check_requests (user_id, granted_ledger_id)
     select $1, id from public.credit_ledger where user_id = $1 order by created_at limit 1`,
    [userId],
  )
  await db.query(
    `insert into public.user_feedback (user_id, rating, comment) values ($1, 'liked', 'fine')`,
    [userId],
  )
  await db.query(
    `insert into public.check_jobs (user_id, status, check_id)
     select $1, 'completed', id from public.symptom_checks where user_id = $1 limit 1`,
    [userId],
  )
}

/** The cleanup the deletion job will run, in the only order the keys allow. */
async function deleteAccount(userId: string): Promise<number> {
  const { rows } = await db.query<{ archive_account_financials: number }>(
    `select public.archive_account_financials($1)`,
    [userId],
  )

  await db.query(`delete from public.symptom_checks where user_id = $1`, [userId])
  await db.query(`delete from public.pets where user_id = $1`, [userId])
  await db.query(`delete from public.profiles where id = $1`, [userId])
  await db.query(`delete from auth.users where id = $1`, [userId])

  return Number(rows[0].archive_account_financials)
}

describe('deleting an account that has spent checks', () => {
  it('is refused outright before the financial rows are moved', async () => {
    await expect(
      db.query(`delete from auth.users where id = $1`, [seeded.ownerAId]),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('archives the bookkeeping, removes the account, and leaves the other owner alone', async () => {
    await addTheRest(seeded.ownerAId)

    // One purchase, one status event, four ledger movements, one v1 receipt.
    // Four ledger rows, and nothing else: the payment tables are gone.
    await expect(deleteAccount(seeded.ownerAId)).resolves.toBe(4)

    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerAId])).toBe(0)

    for (const [table, column] of [
      ['profiles', 'id'],
      ['pets', 'user_id'],
      ['symptom_checks', 'user_id'],
      ['check_jobs', 'user_id'],
      ['user_feedback', 'user_id'],
      ['extra_check_requests', 'user_id'],
      ['credit_ledger', 'user_id'],
    ] as const) {
      expect({
        table,
        left: await count(`select count(*) n from public.${table} where ${column} = $1`, [
          seeded.ownerAId,
        ]),
      }).toEqual({ table, left: 0 })
    }

    // The other owner is not collateral damage.
    expect(await count(`select count(*) n from auth.users where id = $1`, [seeded.ownerBId])).toBe(1)
    expect(await count(`select count(*) n from public.pets where user_id = $1`, [seeded.ownerBId])).toBe(2)
    expect(await count(`select count(*) n from public.credit_ledger where user_id = $1`, [seeded.ownerBId])).toBe(2)
    expect(await count(`select count(*) n from public.financial_archive where subject_ref = $1`, [seeded.ownerBId])).toBe(0)
  })

  it('keeps the money and nothing that describes the person', async () => {
    const { rows } = await db.query<{ source: string; record: Record<string, unknown> }>(
      `select source, record from public.financial_archive where subject_ref = $1`,
      [seeded.ownerAId],
    )

    // Only the ledger now: payments left the product on 10 September, and the
    // ledger is the last financial record an account still carries.
    expect(rows.map((row) => row.source).sort()).toEqual([
      'credit_ledger',
      'credit_ledger',
      'credit_ledger',
      'credit_ledger',
    ])

    const granted = rows
      .map((row) => row.record as { reason?: string; delta?: number })
      .find((record) => record.reason === 'admin_grant')
    expect(granted).toMatchObject({ delta: 5 })

    // The archive is keyed by an identifier that now points at nothing. If an
    // address or a name got in, it would be a second copy of the profile.
    const everything = JSON.stringify(rows).toLowerCase()
    expect(everything).not.toContain(OWNER_A.email)
    expect(everything).not.toContain('fixture.local')
  })

  it('can be run again without duplicating anything', async () => {
    const before = await count(`select count(*) n from public.financial_archive`, [])
    await db.query(`select public.archive_account_financials($1)`, [seeded.ownerAId])
    expect(await count(`select count(*) n from public.financial_archive`, [])).toBe(before)
  })

  it('is not readable by anyone but the service role', async () => {
    const { rows } = await db.query<{ grantee: string }>(
      `select grantee from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'financial_archive'
         and grantee in ('anon', 'authenticated')`,
      [],
    )
    expect(rows).toEqual([])
  })
})
