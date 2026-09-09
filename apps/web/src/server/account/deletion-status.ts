import 'server-only'

import type { AccountDeletionStatus } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { hashReceipt } from '@/server/account/deletion-service'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Answering "is it done yet?" to somebody who no longer has an account.
 *
 * The receipt is the whole of the authority here: it was made on the device
 * before the request was sent, kept apart from the session, and the server
 * holds only its hash. That is what lets this route work after the session has
 * been taken away — which is the point, since by then there is no other way to
 * ask.
 *
 * It follows that the receipt is a bearer secret, and the route is written
 * accordingly: it never reaches a URL, a log, or a cache, and the answer says
 * nothing but the state.
 */

/** What the four database states look like from outside. */
export type PublicDeletionStatus = AccountDeletionStatus['status']

export type StatusLookup =
  | { found: true; status: PublicDeletionStatus }
  /** No such receipt, or one that has outlived its retention. */
  | { found: false }

/**
 * `in_progress` is not in the contract on purpose.
 *
 * Which step the cleanup is on is our business, not the reader's: it changes as
 * the worker changes, and a client that branched on it would break when we
 * reordered the steps. From outside there are three answers worth having — it
 * is happening, it is done, or somebody needs to look at it.
 */
function publicStatus(stored: string): PublicDeletionStatus {
  switch (stored) {
    case 'completed':
      return 'completed'
    case 'action_required':
      return 'action_required'
    default:
      return 'pending'
  }
}

export async function readDeletionStatus(
  supabase: SupabaseService,
  receiptSecret: string,
): Promise<StatusLookup> {
  const { data, error } = await supabase
    .from('deletion_jobs')
    .select('status')
    .eq('receipt_hash', hashReceipt(receiptSecret))
    .maybeSingle()

  // A lookup failure and an unknown receipt are the same answer here. Telling
  // them apart would only be useful to somebody trying receipts.
  if (error || !data) return { found: false }

  return { found: true, status: publicStatus(data.status) }
}
