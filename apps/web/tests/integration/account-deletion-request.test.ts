import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { createServiceClient } from '@/server/supabase/server'
import {
  FRESH_AUTH_WINDOW_SECONDS,
  authenticatedAt,
  consumeReauthProof,
  isFresh,
  issueReauthProof,
} from '@/server/auth/reauth'
import { hashReceipt, requestAccountDeletion } from '@/server/account/deletion-service'
import { connect, seedFixtures, type SeededFixtures } from './fixtures'

/**
 * Stages 5/08 and 8/03: proving somebody is still there, then accepting the
 * request to delete them.
 *
 * The interesting cases are all about what happens twice — a proof used a
 * second time, two requests arriving together, a repeat after the account is
 * already going. Each of those is settled by a single SQL statement rather than
 * by a read followed by a write, and these tests are what hold that in place.
 */

let db: Client
let seeded: SeededFixtures

function service() {
  return createServiceClient()
}

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
})

afterAll(async () => {
  await db.end()
})

/** 32 bytes of hex, the shape the contract demands of a receipt secret. */
function secret(fill: string): string {
  return fill.repeat(64).slice(0, 64)
}

describe('reading how recently somebody authenticated', () => {
  /** A token's payload, unsigned — these tests are about the claim, not the signature. */
  function tokenWith(payload: unknown): string {
    return `header.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.signature`
  }

  const now = new Date('2026-09-09T12:00:00Z')
  const nowSeconds = Math.floor(now.getTime() / 1000)

  it('takes the newest entry when a session carries several', () => {
    const token = tokenWith({
      amr: [
        { method: 'password', timestamp: nowSeconds - 3600 },
        { method: 'otp', timestamp: nowSeconds - 30 },
      ],
    })

    expect(authenticatedAt(token)).toBe(nowSeconds - 30)
  })

  it('refuses a token that says nothing about when anyone authenticated', () => {
    expect(authenticatedAt(tokenWith({ sub: 'x' }))).toBeNull()
    expect(authenticatedAt(tokenWith({ amr: 'password' }))).toBeNull()
    expect(authenticatedAt(tokenWith({ amr: [{ method: 'password' }] }))).toBeNull()
    expect(authenticatedAt('not-a-token')).toBeNull()
    expect(isFresh(null, now)).toBe(false)
  })

  it('counts an old authentication as stale, however new the token is', () => {
    // The point of the whole mechanism: refreshing moves `iat` and leaves
    // `amr` alone, so a month-old sign-in stays a month old.
    expect(isFresh(nowSeconds - FRESH_AUTH_WINDOW_SECONDS - 1, now)).toBe(false)
    expect(isFresh(nowSeconds - FRESH_AUTH_WINDOW_SECONDS + 1, now)).toBe(true)
  })

  it('does not treat a clock from the future as freshness', () => {
    expect(isFresh(nowSeconds + 120, now)).toBe(false)
  })
})

describe('a proof of fresh authentication', () => {
  it('is spent exactly once', async () => {
    const proof = await issueReauthProof(service(), seeded.ownerAId, 'account_deletion')
    expect(proof).not.toBeNull()

    await expect(
      consumeReauthProof(service(), seeded.ownerAId, 'account_deletion', proof!.token),
    ).resolves.toBe(true)

    await expect(
      consumeReauthProof(service(), seeded.ownerAId, 'account_deletion', proof!.token),
    ).resolves.toBe(false)
  })

  it('belongs to one person and refuses to work for another', async () => {
    const proof = await issueReauthProof(service(), seeded.ownerAId, 'account_deletion')

    await expect(
      consumeReauthProof(service(), seeded.ownerBId, 'account_deletion', proof!.token),
    ).resolves.toBe(false)

    // Still unspent for its owner: a failed attempt by somebody else must not
    // burn it.
    await expect(
      consumeReauthProof(service(), seeded.ownerAId, 'account_deletion', proof!.token),
    ).resolves.toBe(true)
  })

  it('is refused once it has expired', async () => {
    const proof = await issueReauthProof(service(), seeded.ownerAId, 'account_deletion')
    await db.query(`update public.reauth_proofs set expires_at = now() - interval '1 second'`)

    await expect(
      consumeReauthProof(service(), seeded.ownerAId, 'account_deletion', proof!.token),
    ).resolves.toBe(false)
  })

  it('is not guessable from what is stored', async () => {
    const proof = await issueReauthProof(service(), seeded.ownerAId, 'account_deletion')
    const { rows } = await db.query<{ token_hash: string }>(
      `select token_hash from public.reauth_proofs order by created_at desc limit 1`,
    )

    expect(rows[0].token_hash).not.toBe(proof!.token)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is refused when nothing was ever issued', async () => {
    await expect(
      consumeReauthProof(service(), seeded.ownerAId, 'account_deletion', 'invented'),
    ).resolves.toBe(false)
  })
})

describe('accepting a deletion request', () => {
  it('refuses without a valid proof, and marks nothing', async () => {
    const outcome = await requestAccountDeletion(service(), {
      userId: seeded.ownerBId,
      receiptSecret: secret('a'),
      reauthToken: 'invented',
    })

    expect(outcome).toEqual({ ok: false, reason: 'reauth_required' })

    const { rows } = await db.query<{ status: string }>(
      `select status from public.profiles where id = $1`,
      [seeded.ownerBId],
    )
    expect(rows[0].status).toBe('active')
    expect(
      (await db.query(`select 1 from public.deletion_jobs where user_id = $1`, [seeded.ownerBId]))
        .rowCount,
    ).toBe(0)
  })

  it('marks the account and records one job', async () => {
    const proof = await issueReauthProof(service(), seeded.ownerAId, 'account_deletion')

    await expect(
      requestAccountDeletion(service(), {
        userId: seeded.ownerAId,
        receiptSecret: secret('b'),
        reauthToken: proof!.token,
      }),
    ).resolves.toEqual({ ok: true })

    const { rows } = await db.query<{ status: string; receipt_hash: string; progress: unknown }>(
      `select p.status, j.receipt_hash, j.progress
         from public.profiles p join public.deletion_jobs j on j.user_id = p.id
        where p.id = $1`,
      [seeded.ownerAId],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('deleting')
    // The secret itself is never written down.
    expect(rows[0].receipt_hash).toBe(hashReceipt(secret('b')))
    expect(rows[0].receipt_hash).not.toBe(secret('b'))
  })

  it('gives one job to requests that arrive together', async () => {
    // Ten proofs, ten requests, all at once — the shape of a person tapping a
    // button that did not visibly respond.
    const proofs = await Promise.all(
      Array.from({ length: 10 }, () =>
        issueReauthProof(service(), seeded.ownerBId, 'account_deletion'),
      ),
    )

    const outcomes = await Promise.all(
      proofs.map((proof) =>
        requestAccountDeletion(service(), {
          userId: seeded.ownerBId,
          receiptSecret: secret('c'),
          reauthToken: proof!.token,
        }),
      ),
    )

    expect(outcomes.every((outcome) => outcome.ok)).toBe(true)

    const jobs = await db.query(`select 1 from public.deletion_jobs where user_id = $1`, [
      seeded.ownerBId,
    ])
    expect(jobs.rowCount).toBe(1)

    const { rows } = await db.query<{ status: string }>(
      `select status from public.profiles where id = $1`,
      [seeded.ownerBId],
    )
    expect(rows[0].status).toBe('deleting')
  })

  it('leaves nothing half-done when the account is not there', async () => {
    const ghost = '00000000-0000-4000-8000-000000000009'
    const { rows } = await db.query<{ ok: boolean }>(
      `select public.request_account_deletion($1, $2) as ok`,
      [ghost, 'hash'],
    )

    expect(rows[0].ok).toBe(false)
    expect(
      (await db.query(`select 1 from public.deletion_jobs where user_id = $1`, [ghost])).rowCount,
    ).toBe(0)
  })

  it('keeps the job out of reach of anon and authenticated', async () => {
    const { rows } = await db.query<{ grantee: string }>(
      `select grantee from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('deletion_jobs', 'reauth_proofs')
          and grantee in ('anon', 'authenticated')`,
    )
    expect(rows).toEqual([])
  })
})
