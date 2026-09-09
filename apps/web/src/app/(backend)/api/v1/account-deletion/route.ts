import { NextRequest } from 'next/server'
import {
  AccountDeletionAcceptedSchema,
  AccountDeletionRequestSchema,
  DELETION_RECEIPT_HEADER,
} from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { apiError, apiSuccess } from '@/server/api/response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { requestAccountDeletion } from '@/server/account/deletion-service'

/**
 * Accepts a request to delete the account (stage 8/03).
 *
 * Answers only that the request was accepted. The work is a job, and the person
 * follows it with the receipt they made themselves — never with an id or an
 * address echoed back here.
 *
 * A second request from the same person does not reach this handler at all:
 * `withApiAuth` refuses an account already marked `deleting`, which is also how
 * every other route stops accepting work the moment the first request lands.
 * Requests racing each other do reach it, and the database gives them one job.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = AccountDeletionRequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const outcome = await requestAccountDeletion(createServiceClient(), {
    userId: context.account.userId,
    receiptSecret: parsed.data.receipt_secret,
    reauthToken: parsed.data.reauth_token,
  })

  if (!outcome.ok) {
    if (outcome.reason === 'reauth_required') {
      return apiError(context.requestId, 'reauth_required', 'Authenticate again to continue')
    }
    if (outcome.reason === 'not_found') {
      return apiError(context.requestId, 'not_found', 'No such account')
    }
    console.error(`[${context.requestId}] deletion request failed`)
    return apiError(context.requestId, 'internal_error', 'Could not accept the request')
  }

  const response = apiSuccess(
    context.requestId,
    AccountDeletionAcceptedSchema.parse({ status: 'accepted' }),
    202,
  )
  // The receipt is the client's; nothing about it is cached anywhere.
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Vary', DELETION_RECEIPT_HEADER)
  return response
})
