import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { createServiceClient } from '@/server/supabase/server'
import { issueReauthProof } from '@/server/auth/reauth'
import { requestAccountDeletion } from '@/server/account/deletion-service'
import { loadAccount } from '@/server/auth/account-state'
import { FIXTURE_PASSWORD, OWNER_A, connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * What is true after an account is gone.
 *
 * Stage 8/04: the job and the receipt outlive the Auth user, and go by
 * themselves once their retention runs out. Stage 8/06: a token issued before
 * the deletion opens nothing afterwards — neither through our API nor through
 * PostgREST, because a JWT stays signature-valid until it expires and cannot be
 * treated as revoked just because the user is not there any more.
 */

let db: Client
let seeded: SeededFixtures

function service() {
  return createServiceClient()
}

/** A client carrying a real user session, exactly what a phone would hold. */
async function tokenFor(email: string): Promise<string> {
  const client = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: FIXTURE_PASSWORD,
  })
  if (error || !data.session) throw error ?? new Error('no session')
  return data.session.access_token
}

/** The ordered cleanup from the data map, as stage 8/05 will run it. */
async function eraseAccount(userId: string): Promise<void> {
  // Surfaced rather than ignored: this call silently failed for want of an
  // execute grant, and the failure only showed up three statements later as a
  // foreign key violation.
  const { error } = await service().rpc('archive_account_financials', { p_user_id: userId })
  if (error) throw new Error(`archive failed: ${error.message}`)
  await db.query(`delete from public.symptom_checks where user_id = $1`, [userId])
  await db.query(`delete from public.pets where user_id = $1`, [userId])
  await db.query(`delete from public.profiles where id = $1`, [userId])
  await db.query(`delete from auth.users where id = $1`, [userId])
}

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
})

afterAll(async () => {
  await db.end()
})

describe('after the account is gone', () => {
  let staleToken: string

  it('keeps the job and its receipt when the Auth user is deleted', async () => {
    // A token taken while the account still works — this is the one that must
    // stop opening things.
    staleToken = await tokenFor(OWNER_A.email)

    const proof = await issueReauthProof(service(), seeded.ownerAId, 'account_deletion')
    await requestAccountDeletion(service(), {
      userId: seeded.ownerAId,
      receiptSecret: 'd'.repeat(64),
      reauthToken: proof!.token,
    })

    await eraseAccount(seeded.ownerAId)

    expect(
      (await db.query(`select 1 from auth.users where id = $1`, [seeded.ownerAId])).rowCount,
    ).toBe(0)

    // The point of 8/04: the record of the work survives the subject of it.
    const { rows } = await db.query<{ status: string; receipt_hash: string }>(
      `select status, receipt_hash from public.deletion_jobs where user_id = $1`,
      [seeded.ownerAId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
  })

  it('holds nothing about the person beyond what the work needs', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `select * from public.deletion_jobs where user_id = $1`,
      [seeded.ownerAId],
    )

    expect(Object.keys(rows[0]).sort()).toEqual([
      'completed_at',
      'error_code',
      'id',
      'progress',
      'receipt_hash',
      'requested_at',
      'retain_until',
      'status',
      'updated_at',
      'user_id',
    ])

    // No address, no name, no locale — and the receipt kept as a hash, so the
    // table cannot be read to impersonate one.
    expect(JSON.stringify(rows[0])).not.toContain('fixture.local')
    expect(rows[0].receipt_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses the token it issued before the deletion', async () => {
    // Straight at PostgREST with the old token: no route of ours in the way.
    const asDeletedUser = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${staleToken}` } },
      },
    )

    for (const table of ['pets', 'symptom_checks', 'profiles', 'credit_ledger'] as const) {
      const { data } = await asDeletedUser.from(table).select('*')
      expect({ table, rows: data?.length ?? 0 }).toEqual({ table, rows: 0 })
    }

    // And through our own gate, which is what the API routes stand behind.
    const account = await loadAccount(service(), seeded.ownerAId)
    expect(account.ok).toBe(false)
  })

  it('does not hand the other owner over to it either', async () => {
    const asDeletedUser = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${staleToken}` } },
      },
    )

    const { data } = await asDeletedUser.from('pets').select('*').eq('user_id', seeded.ownerBId)
    expect(data ?? []).toEqual([])

    // Owner B is untouched by any of this.
    expect(
      (await db.query(`select 1 from public.pets where user_id = $1`, [seeded.ownerBId])).rowCount,
    ).toBe(2)
  })
})

describe('retention of the record itself', () => {
  it('keeps a job nobody has set a deadline for', async () => {
    // Null is "undecided", not "expired": the published deletion deadline is
    // open question 1.8, and until it is answered the record stays.
    await db.query(`select public.complete_deletion_job($1, null)`, [seeded.ownerAId])

    const removed = await db.query<{ n: number }>(
      `select public.purge_expired_deletion_jobs(now() + interval '100 years') as n`,
    )
    expect(Number(removed.rows[0].n)).toBe(0)
    expect(
      (await db.query(`select 1 from public.deletion_jobs where user_id = $1`, [seeded.ownerAId]))
        .rowCount,
    ).toBe(1)
  })

  it('removes one whose retention has run out', async () => {
    await db.query(`select public.complete_deletion_job($1, interval '30 days')`, [seeded.ownerAId])

    const { rows } = await db.query<{ retain_until: string; status: string }>(
      `select retain_until, status from public.deletion_jobs where user_id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].status).toBe('completed')
    expect(rows[0].retain_until).not.toBeNull()

    const early = await db.query<{ n: number }>(
      `select public.purge_expired_deletion_jobs(now() + interval '29 days') as n`,
    )
    expect(Number(early.rows[0].n)).toBe(0)

    const late = await db.query<{ n: number }>(
      `select public.purge_expired_deletion_jobs(now() + interval '31 days') as n`,
    )
    expect(Number(late.rows[0].n)).toBe(1)
  })

  it('never sweeps work that has not finished', async () => {
    await db.query(
      `insert into public.deletion_jobs (user_id, receipt_hash, status, retain_until)
       values ($1, 'unfinished', 'action_required', now() - interval '1 year')`,
      [seeded.ownerBId],
    )

    const removed = await db.query<{ n: number }>(
      `select public.purge_expired_deletion_jobs(now() + interval '100 years') as n`,
    )
    expect(Number(removed.rows[0].n)).toBe(0)

    // Losing this row would lose the deletion itself, which is worse than
    // keeping a record longer than promised.
    expect(
      (await db.query(`select 1 from public.deletion_jobs where user_id = $1`, [seeded.ownerBId]))
        .rowCount,
    ).toBe(1)
  })
})
