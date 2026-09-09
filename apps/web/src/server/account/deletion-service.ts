import 'server-only'

import { createHash } from 'node:crypto'
import { DELETION_RECORD_RETENTION_DAYS } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { consumeReauthProof } from '@/server/auth/reauth'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Accepting a request to delete an account (stage 8/03).
 *
 * Two things have to be true before anything is written: the person proved a
 * moment ago that they are still there, and that proof was minted for this
 * operation and has not been spent. Both are settled by the database in one
 * statement each, so two requests racing cannot both win.
 *
 * What this does *not* do is the deleting. It marks the account and records the
 * job; the cleanup itself is stage 8/05, and keeping the two apart is what
 * makes a failure halfway through resumable rather than half-done.
 *
 * No `next/*` import belongs here — the route turns these outcomes into
 * responses.
 */

export type DeletionOutcome =
  | { ok: true }
  /** The proof was absent, expired, already spent, or minted for someone else. */
  | { ok: false; reason: 'reauth_required' }
  /** The account is gone. Nothing to accept. */
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'internal_error' }

/**
 * The stored form of the client's receipt secret.
 *
 * Only the hash is ever written. The secret is made on the device before the
 * request and kept apart from the session, so a person whose `202` was lost can
 * still ask what happened after their session is gone — and a copy of our table
 * is not a set of usable receipts.
 */
export function hashReceipt(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export async function requestAccountDeletion(
  supabase: SupabaseService,
  input: { userId: string; receiptSecret: string; reauthToken: string },
): Promise<DeletionOutcome> {
  const proven = await consumeReauthProof(
    supabase,
    input.userId,
    'account_deletion',
    input.reauthToken,
  )
  if (!proven) return { ok: false, reason: 'reauth_required' }

  const { data, error } = await supabase.rpc('request_account_deletion', {
    p_user_id: input.userId,
    p_receipt_hash: hashReceipt(input.receiptSecret),
  })

  if (error) return { ok: false, reason: 'internal_error' }
  if (data !== true) return { ok: false, reason: 'not_found' }

  return { ok: true }
}

/**
 * Marks the cleanup finished and starts the clock on the record itself.
 *
 * The retention is passed from one named constant rather than defaulted in SQL,
 * so the published figure lives in a single place the owner can point at and
 * the database cannot quietly disagree with the policy page.
 *
 * Called by the cleanup worker (stage 8/05) as its last step. Until that
 * exists, this is what the tests drive.
 */
export async function completeDeletionJob(
  supabase: SupabaseService,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_deletion_job', {
    p_user_id: userId,
    p_retain_for: `${DELETION_RECORD_RETENTION_DAYS} days`,
  })

  return !error && data === true
}
