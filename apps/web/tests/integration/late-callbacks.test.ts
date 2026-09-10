import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { createServiceClient } from '@/server/supabase/server'
import { issueReauthProof } from '@/server/auth/reauth'
import { requestAccountDeletion } from '@/server/account/deletion-service'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stage 8/07: what arrives too late.
 *
 * A worker that finishes after the request, a Telegram approval tapped a minute
 * afterwards, a payment webhook whenever the provider feels like sending it —
 * none of them may put a row or a credit on an account that is leaving.
 *
 * The dangerous window is `deleting` rather than gone. Once the Auth user is
 * removed the foreign keys refuse most of this on their own; while the status
 * is `deleting` the rows are all still there, the cleanup may be halfway
 * through, and a late insert lands in data that is being erased and outlives
 * it. So every case here runs against an account in exactly that state.
 *
 * These callers reach the database through the service role, which row level
 * security does not apply to — which is why the guard is a trigger on the
 * tables and not a policy.
 */

let db: Client
let seeded: SeededFixtures

function service() {
  return createServiceClient()
}

/** Puts owner A into the state a late callback would find them in. */
async function startDeleting(userId: string): Promise<void> {
  const proof = await issueReauthProof(service(), userId, 'account_deletion')
  const outcome = await requestAccountDeletion(service(), {
    userId,
    receiptSecret: 'e'.repeat(64),
    reauthToken: proof!.token,
  })
  if (!outcome.ok) throw new Error('could not start the deletion')
}

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
  await startDeleting(seeded.ownerAId)
})

afterAll(async () => {
  await db.end()
})

describe('a late answer from the analysis', () => {
  it('cannot record a check for an account that is leaving', async () => {
    await expect(
      db.query(
        `insert into public.symptom_checks (user_id, symptoms_input, urgency, locale)
         values ($1, 'arrived too late', 'monitor', 'ru')`,
        [seeded.ownerAId],
      ),
    ).rejects.toThrow(/not accepting writes/)
  })

  it('cannot record the job it came from either', async () => {
    await expect(
      db.query(`insert into public.check_jobs (user_id, status) values ($1, 'completed')`, [
        seeded.ownerAId,
      ]),
    ).rejects.toThrow(/not accepting writes/)
  })

  it('cannot spend a credit for it', async () => {
    const { error } = await service().rpc('apply_symptom_check_usage', {
      p_user_id: seeded.ownerAId,
      p_symptom_check_id: '11111111-1111-4111-8111-000000000101',
    })
    expect(error).not.toBeNull()
  })
})

describe('a late approval from Telegram', () => {
  it('cannot grant the extra check it was approving', async () => {
    // The request itself was made while the account still worked; the tap comes
    // after. Only the second half is refused, which is the point.
    await db.query(
      `insert into public.extra_check_requests (user_id, status) values ($1, 'pending')`,
      [seeded.ownerBId],
    )
    const { rows } = await db.query<{ id: string }>(
      `select id from public.extra_check_requests where user_id = $1`,
      [seeded.ownerBId],
    )

    // Owner B is active, so this one goes through — the guard is about state,
    // not about the callback being late in the abstract.
    const ok = await service().rpc('resolve_extra_check_request', {
      p_request_id: rows[0].id,
      p_action: 'approve',
      p_admin_telegram_id: 1,
      p_admin_username: 'someone',
    })
    expect(ok.error).toBeNull()

    // The same thing for the account that is leaving.
    await expect(
      db.query(
        `insert into public.extra_check_requests (user_id, status) values ($1, 'pending')`,
        [seeded.ownerAId],
      ),
    ).rejects.toThrow(/not accepting writes/)
  })
})

describe('a late refund', () => {
  it('is refused rather than credited', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.credit_ledger where user_id = $1 and reason = 'usage' limit 1`,
      [seeded.ownerAId],
    )

    const { error } = await service().rpc('refund_symptom_check_usage', {
      p_user_id: seeded.ownerAId,
      p_usage_ledger_id: rows[0].id,
      p_reason: 'analysis failed after the account was closed',
    })
    expect(error).not.toBeNull()
  })
})

describe('a pet that arrives or changes too late', () => {
  it('cannot be added', async () => {
    await expect(
      db.query(`insert into public.pets (user_id, name, species) values ($1, 'Ghost', 'cat')`, [
        seeded.ownerAId,
      ]),
    ).rejects.toThrow(/not accepting writes/)
  })

  it('cannot be soft-deleted twice, or at all', async () => {
    // A repeat of "delete my pet" arriving after the account went is the case
    // the criterion names. It is an update, and updates are refused.
    await expect(
      db.query(`update public.pets set deleted_at = now() where user_id = $1`, [seeded.ownerAId]),
    ).rejects.toThrow(/not accepting writes/)
  })

  it('can still be deleted outright, because that is what the cleanup does', async () => {
    // The guard must not stand in the way of the deletion it protects.
    const before = await db.query(`select 1 from public.pets where user_id = $1`, [seeded.ownerAId])
    expect(before.rowCount).toBeGreaterThan(0)

    // In the order the data map derives from the foreign keys: the ledger
    // holds the checks, and the checks hold the pets.
    await service().rpc('archive_account_financials', { p_user_id: seeded.ownerAId })
    await db.query(`delete from public.symptom_checks where user_id = $1`, [seeded.ownerAId])
    await db.query(`delete from public.pets where user_id = $1`, [seeded.ownerAId])
    expect(
      (await db.query(`select 1 from public.pets where user_id = $1`, [seeded.ownerAId])).rowCount,
    ).toBe(0)
  })
})

describe('everybody else', () => {
  it('is unaffected while one account is being deleted', async () => {
    await db.query(`insert into public.pets (user_id, name, species) values ($1, 'Fine', 'dog')`, [
      seeded.ownerBId,
    ])
    await db.query(`update public.profiles set credits = credits + 1 where id = $1`, [
      seeded.ownerBId,
    ])

    const { rows } = await db.query<{ n: string }>(
      `select count(*) n from public.pets where user_id = $1`,
      [seeded.ownerBId],
    )
    expect(Number(rows[0].n)).toBe(3)
  })
})

describe('an account that is already gone', () => {
  it('refuses the same writes, without leaning on foreign keys to do it', async () => {
    const orphan = '00000000-0000-4000-8000-00000000dead'

    await expect(
      db.query(`insert into public.pets (user_id, name, species) values ($1, 'Nobody', 'cat')`, [
        orphan,
      ]),
    ).rejects.toThrow(/not accepting writes/)
  })
})
