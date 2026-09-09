import { NextRequest } from 'next/server'
import {
  AccountDeletionStatusSchema,
  DELETION_RECEIPT_HEADER,
  DeletionReceiptSecretSchema,
} from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { apiError, apiSuccess, newRequestId } from '@/server/api/response'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { hashReceipt } from '@/server/account/deletion-service'
import { readDeletionStatus } from '@/server/account/deletion-status'

/**
 * How somebody finds out whether their deletion finished (stage 9/04).
 *
 * Deliberately the one route in /api/v1 with no session behind it. By the time
 * this matters the account is gone or going, so a token is exactly what the
 * caller does not have. Authority comes from the receipt secret they made on
 * their own device before sending the request.
 *
 * Four consequences follow from that, and all four are in the code below:
 *
 *  - the secret travels in a header, never in the query, so it stays out of
 *    server logs, browser history and referrers;
 *  - nothing here logs it, and the rate limiter is given its hash;
 *  - the allowance is spent per receipt rather than per user, because there is
 *    no user to count against;
 *  - the answer is the state and nothing else — no address, no identifier, no
 *    hint about what the account held — and is not cached anywhere.
 */
export async function GET(request: NextRequest) {
  const requestId = newRequestId()

  const secret = request.headers.get(DELETION_RECEIPT_HEADER)
  const parsed = DeletionReceiptSecretSchema.safeParse(secret)
  if (!parsed.success) {
    // Same answer as a receipt that does not exist. A malformed one is not
    // worth its own message: it would only help somebody probing.
    return noStore(apiError(requestId, 'not_found', 'No such deletion request'))
  }

  const supabase = createServiceClient()

  // By hash, never by the secret: a bucket name reaches the database and could
  // reach a log with it.
  const verdict = await consumeRateLimit(supabase, 'deletion_status', hashReceipt(parsed.data))
  if (!verdict.allowed) {
    return noStore(apiError(requestId, 'rate_limited', 'Too many status checks'))
  }

  const lookup = await readDeletionStatus(supabase, parsed.data)
  if (!lookup.found) {
    return noStore(apiError(requestId, 'not_found', 'No such deletion request'))
  }

  return noStore(
    apiSuccess(requestId, AccountDeletionStatusSchema.parse({ status: lookup.status })),
  )
}

/** Nothing about a deletion belongs in a cache, including the fact of asking. */
function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Vary', DELETION_RECEIPT_HEADER)
  return response
}
