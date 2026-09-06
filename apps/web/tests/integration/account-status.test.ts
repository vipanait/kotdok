import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { loadAccount } from '@/server/auth/account-state'
import { FIXTURE_PASSWORD, OWNER_A, connect, seedFixtures, type SeededFixtures } from './fixtures'

/** The service-role client the server layer uses. */
function serviceClient() {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as never
}

let db: Client
let seeded: SeededFixtures

/** A client carrying a real user session, exactly what a phone would hold. */
async function signedInAsOwnerA(): Promise<SupabaseClient> {
  const client = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { error } = await client.auth.signInWithPassword({
    email: OWNER_A.email,
    password: FIXTURE_PASSWORD,
  })
  if (error) throw error

  return client
}

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
})

afterAll(async () => {
  await db?.end()
})

describe('account lifecycle state', () => {
  it('starts every account as active', async () => {
    const { rows } = await db.query<{ status: string }>(
      `select status from public.profiles order by status`,
    )

    expect(rows.map((row) => row.status)).toEqual(['active', 'active'])
  })

  it('only allows the states the contract defines', async () => {
    await expect(
      db.query(`update public.profiles set status = 'suspended' where id = $1`, [seeded.ownerAId]),
    ).rejects.toThrow()
  })

  it('lets a trusted server move an account to deleting', async () => {
    await db.query(`update public.profiles set status = 'deleting' where id = $1`, [seeded.ownerAId])

    const { rows } = await db.query<{ status: string }>(
      `select status from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].status).toBe('deleting')

    await db.query(`update public.profiles set status = 'active' where id = $1`, [seeded.ownerAId])
  })
})

describe('what a user token may write directly', () => {
  it('reads only its own profile', async () => {
    const client = await signedInAsOwnerA()

    const { data } = await client.from('profiles').select('id, credits')

    expect(data?.map((row) => row.id)).toEqual([seeded.ownerAId])
  })

  it('cannot raise its own balance', async () => {
    const client = await signedInAsOwnerA()

    await client.from('profiles').update({ credits: 9999 }).eq('id', seeded.ownerAId)

    const { rows } = await db.query<{ credits: number }>(
      `select credits from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].credits).toBe(OWNER_A.expectedCredits)
  })

  it('cannot make itself an admin', async () => {
    const client = await signedInAsOwnerA()

    await client.from('profiles').update({ role: 'admin' }).eq('id', seeded.ownerAId)

    const { rows } = await db.query<{ role: string }>(
      `select role from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].role).toBe('user')
  })

  it('cannot change its own account state', async () => {
    const client = await signedInAsOwnerA()

    await client.from('profiles').update({ status: 'deleting' }).eq('id', seeded.ownerAId)

    const { rows } = await db.query<{ status: string }>(
      `select status from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].status).toBe('active')
  })

  it('cannot write a credit ledger row', async () => {
    const client = await signedInAsOwnerA()

    await client
      .from('credit_ledger')
      .insert({ user_id: seeded.ownerAId, delta: 100, reason: 'admin_grant', balance_after: 105 })

    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.credit_ledger where user_id = $1 and delta = 100`,
      [seeded.ownerAId],
    )
    expect(rows[0].count).toBe('0')
  })
})

describe('the guard every service goes through', () => {
  it('lets an active account act', async () => {
    const result = await loadAccount(serviceClient(), seeded.ownerAId)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.account.userId).toBe(seeded.ownerAId)
      expect(result.account.credits).toBe(OWNER_A.expectedCredits)
      expect(result.account.role).toBe('user')
    }
  })

  it('refuses an account that is being deleted', async () => {
    await db.query(`update public.profiles set status = 'deleting' where id = $1`, [seeded.ownerAId])

    const result = await loadAccount(serviceClient(), seeded.ownerAId)

    expect(result).toEqual({ ok: false, reason: 'account_deleting' })

    await db.query(`update public.profiles set status = 'active' where id = $1`, [seeded.ownerAId])
  })

  it('refuses an account that does not exist', async () => {
    const result = await loadAccount(serviceClient(), '00000000-0000-4000-8000-000000000000')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
