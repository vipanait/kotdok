import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { createServiceClient } from '@/server/supabase/server'
import { issueReauthProof } from '@/server/auth/reauth'
import { hashReceipt, requestAccountDeletion } from '@/server/account/deletion-service'
import { readDeletionStatus } from '@/server/account/deletion-status'
import { consumeRateLimit, RATE_LIMITS } from '@/server/api/rate-limit'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 9/04: asking whether the deletion finished, with no session left.
 *
 * The receipt is the entire authority, which makes it a bearer secret. These
 * tests are mostly about what the route must *not* do with it.
 */

let db: Client
let seeded: SeededFixtures

/** 32 bytes of hex, the shape the contract demands. */
const RECEIPT = 'a1b2c3d4'.repeat(8)
const OTHER_RECEIPT = 'f9e8d7c6'.repeat(8)

function service() {
  return createServiceClient()
}

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)

  const proof = await issueReauthProof(service(), seeded.ownerAId, 'account_deletion')
  const outcome = await requestAccountDeletion(service(), {
    userId: seeded.ownerAId,
    receiptSecret: RECEIPT,
    reauthToken: proof!.token,
  })
  if (!outcome.ok) throw new Error('could not start the deletion')
})

afterAll(async () => {
  await db.end()
})

describe('the status behind a receipt', () => {
  it('answers the person who holds it', async () => {
    await expect(readDeletionStatus(service(), RECEIPT)).resolves.toEqual({
      found: true,
      status: 'pending',
    })
  })

  it('says nothing to a receipt nobody issued', async () => {
    await expect(readDeletionStatus(service(), OTHER_RECEIPT)).resolves.toEqual({ found: false })
  })

  it('keeps our own stages to ourselves', async () => {
    // `in_progress` is a step of the worker, not something a client should
    // branch on: reorder the cleanup and the meaning would change under them.
    await db.query(`update public.deletion_jobs set status = 'in_progress' where user_id = $1`, [
      seeded.ownerAId,
    ])

    await expect(readDeletionStatus(service(), RECEIPT)).resolves.toEqual({
      found: true,
      status: 'pending',
    })
  })

  it('does not pretend a stuck deletion finished', async () => {
    await db.query(
      `update public.deletion_jobs set status = 'action_required', error_code = 'apple_unreachable'
        where user_id = $1`,
      [seeded.ownerAId],
    )

    const lookup = await readDeletionStatus(service(), RECEIPT)
    expect(lookup).toEqual({ found: true, status: 'action_required' })
  })

  it('reports completion once it is true', async () => {
    await db.query(`select public.complete_deletion_job($1, interval '60 days')`, [seeded.ownerAId])

    await expect(readDeletionStatus(service(), RECEIPT)).resolves.toEqual({
      found: true,
      status: 'completed',
    })
  })

  it('stops answering once the record has been swept', async () => {
    // After the retention runs out there is nothing left to ask about, and the
    // answer is the same as for a receipt that never existed.
    await db.query(`select public.purge_expired_deletion_jobs(now() + interval '61 days')`)

    await expect(readDeletionStatus(service(), RECEIPT)).resolves.toEqual({ found: false })
  })
})

describe('what is stored, and what is not', () => {
  it('keeps the secret out of the database', async () => {
    const proof = await issueReauthProof(service(), seeded.ownerBId, 'account_deletion')
    await requestAccountDeletion(service(), {
      userId: seeded.ownerBId,
      receiptSecret: OTHER_RECEIPT,
      reauthToken: proof!.token,
    })

    const { rows } = await db.query<{ receipt_hash: string }>(
      `select receipt_hash from public.deletion_jobs where user_id = $1`,
      [seeded.ownerBId],
    )

    expect(rows[0].receipt_hash).toBe(hashReceipt(OTHER_RECEIPT))
    expect(rows[0].receipt_hash).not.toBe(OTHER_RECEIPT)

    // Nowhere else in the row either.
    const all = await db.query(`select * from public.deletion_jobs where user_id = $1`, [
      seeded.ownerBId,
    ])
    expect(JSON.stringify(all.rows[0])).not.toContain(OTHER_RECEIPT)
  })

  it('answers with the state and nothing else', async () => {
    const lookup = await readDeletionStatus(service(), OTHER_RECEIPT)
    expect(Object.keys(lookup).sort()).toEqual(['found', 'status'])
  })
})

describe('how often it may be asked', () => {
  it('is limited per receipt rather than per person', async () => {
    // There is no person to count against by then, and one receipt being
    // hammered must not lock out another.
    const { limit } = RATE_LIMITS.deletion_status
    const mine = hashReceipt('1'.repeat(64))
    const theirs = hashReceipt('2'.repeat(64))

    let last = { allowed: true }
    for (let i = 0; i < limit + 1; i += 1) {
      last = await consumeRateLimit(service(), 'deletion_status', mine)
    }
    expect(last.allowed).toBe(false)

    // The other receipt still has its whole allowance.
    await expect(
      consumeRateLimit(service(), 'deletion_status', theirs).then((v) => v.allowed),
    ).resolves.toBe(true)
  })

  it('counts the hash, so the bucket name is not a secret', async () => {
    const secret = '3'.repeat(64)
    await consumeRateLimit(service(), 'deletion_status', hashReceipt(secret))

    const { rows } = await db.query<{ bucket: string }>(
      `select bucket from public.api_rate_limits where bucket like 'deletion_status:%'`,
    )

    for (const row of rows) {
      expect(row.bucket).not.toContain(secret)
    }
    expect(rows.some((row) => row.bucket === `deletion_status:${hashReceipt(secret)}`)).toBe(true)
  })
})
