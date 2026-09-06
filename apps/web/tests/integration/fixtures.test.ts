import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  CHECK_IDS,
  OWNER_A,
  OWNER_B,
  PET_IDS,
  connect,
  seedFixtures,
  type SeededFixtures,
} from './fixtures'

let client: Client
let seeded: SeededFixtures

beforeAll(async () => {
  client = await connect()
  seeded = await seedFixtures(client)
})

afterAll(async () => {
  await client?.end()
})

/** Business content of the fixtures, with generated user ids normalised away. */
async function fingerprint(db: Client, owners: SeededFixtures): Promise<string[]> {
  const { rows } = await db.query<{ line: string }>(
    `select line from (
       select format('profile %s credits=%s locale=%s role=%s', u.email, p.credits, p.locale, p.role) as line
       from public.profiles p join auth.users u on u.id = p.id
       union all
       select format('pet %s owner=%s species=%s deleted=%s', pe.name, u.email, pe.species, pe.deleted_at is not null)
       from public.pets pe join auth.users u on u.id = pe.user_id
       union all
       select format('check %s owner=%s urgency=%s deleted=%s', sc.symptoms_input, u.email, sc.urgency, sc.deleted_at is not null)
       from public.symptom_checks sc join auth.users u on u.id = sc.user_id
       union all
       select format('ledger %s %s %s balance=%s', u.email, cl.delta, cl.reason, cl.balance_after)
       from public.credit_ledger cl join auth.users u on u.id = cl.user_id
       union all
       select format('transaction %s %s units=%s amount=%s', u.email, t.current_status, t.units_total, t.amount)
       from public.transactions t join auth.users u on u.id = t.user_id
     ) s order by line`,
  )
  void owners
  return rows.map((row) => row.line)
}

describe('integration fixtures', () => {
  it('creates two distinct owners', async () => {
    const { rows } = await client.query<{ email: string; id: string }>(
      `select id, email from auth.users order by email`,
    )

    expect(rows.map((row) => row.email)).toEqual([OWNER_A.email, OWNER_B.email])
    expect(rows[0].id).not.toBe(rows[1].id)
    expect(new Set([rows[0].id, rows[1].id])).toEqual(new Set([seeded.ownerAId, seeded.ownerBId]))
  })

  it('gives each owner their own pets', async () => {
    const { rows } = await client.query<{ user_id: string; id: string }>(
      `select id, user_id from public.pets order by id`,
    )

    const byOwner = new Map<string, string[]>()
    for (const row of rows) byOwner.set(row.user_id, [...(byOwner.get(row.user_id) ?? []), row.id])

    expect(byOwner.get(seeded.ownerAId)?.sort()).toEqual([PET_IDS.aCat, PET_IDS.aDog].sort())
    expect(byOwner.get(seeded.ownerBId)?.sort()).toEqual([PET_IDS.bCat, PET_IDS.bDeleted].sort())
  })

  it('gives each owner their own checks, including one soft-deleted', async () => {
    const { rows } = await client.query<{ id: string; user_id: string; deleted: boolean }>(
      `select id, user_id, deleted_at is not null as deleted from public.symptom_checks order by id`,
    )

    const forA = rows.filter((row) => row.user_id === seeded.ownerAId).map((row) => row.id)
    const forB = rows.filter((row) => row.user_id === seeded.ownerBId)

    expect(forA.sort()).toEqual([CHECK_IDS.aFirst, CHECK_IDS.aSecond].sort())
    expect(forB.filter((row) => row.deleted).map((row) => row.id)).toEqual([CHECK_IDS.bDeleted])
    expect(forB.filter((row) => !row.deleted).map((row) => row.id)).toEqual([CHECK_IDS.bOnly])
  })

  it('keeps different balances that match the ledger', async () => {
    const { rows } = await client.query<{ id: string; credits: number; ledger_sum: string; last_balance: number }>(
      `select p.id,
              p.credits,
              (select coalesce(sum(delta), 0) from public.credit_ledger where user_id = p.id) as ledger_sum,
              (select balance_after from public.credit_ledger where user_id = p.id order by created_at desc limit 1) as last_balance
       from public.profiles p`,
    )

    const byId = new Map(rows.map((row) => [row.id, row]))
    const a = byId.get(seeded.ownerAId)!
    const b = byId.get(seeded.ownerBId)!

    expect(a.credits).toBe(OWNER_A.expectedCredits)
    expect(b.credits).toBe(OWNER_B.expectedCredits)
    expect(a.credits).not.toBe(b.credits)

    for (const row of [a, b]) {
      expect(Number(row.ledger_sum)).toBe(row.credits)
      expect(row.last_balance).toBe(row.credits)
    }
  })

  it('records one succeeded test transaction for owner A only', async () => {
    const { rows } = await client.query<{ user_id: string; current_status: string; units_total: number }>(
      `select user_id, current_status, units_total from public.transactions`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(seeded.ownerAId)
    expect(rows[0].current_status).toBe('succeeded')
    expect(rows[0].units_total).toBe(5)
  })

  it('produces the same data set when redeployed', async () => {
    const before = await fingerprint(client, seeded)

    const reseeded = await seedFixtures(client)
    const after = await fingerprint(client, reseeded)

    expect(after).toEqual(before)
    // Ids are regenerated, so the fixtures must not depend on them.
    expect(reseeded.ownerAId).not.toBe('')
    seeded = reseeded
  })
})
