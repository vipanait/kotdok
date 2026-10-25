import { ExtraCheckRequestStatusSchema } from '@lapka/contracts'
import {
  readExtraCheckRequestStatus,
  submitExtraCheckRequest,
  type SubmitExtraCheckResult,
} from '@/server/extra-check/extra-check-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

export const GET = withApiAuth(async (_request, context: ApiContext) => {
  const status = await readExtraCheckRequestStatus(context.account.userId)

  return apiSuccess(context.requestId, ExtraCheckRequestStatusSchema.parse({ status }))
})

/**
 * The same service the site uses, so the "one pending request per user" rule
 * lives in one place and both clients hit it.
 */
export const POST = withApiAuth(async (_request, context: ApiContext) => {
  const result = await submitExtraCheckRequest(context.account.userId)
  if (!result.ok) return refusal(context.requestId, result)

  const status = await readExtraCheckRequestStatus(context.account.userId)
  return apiSuccess(context.requestId, ExtraCheckRequestStatusSchema.parse({ status }))
})

function refusal(requestId: string, result: Extract<SubmitExtraCheckResult, { ok: false }>) {
  switch (result.reason) {
    case 'rate_limited':
      return apiError(requestId, 'rate_limited', 'Too many requests')
    case 'account_deleting':
      return apiError(requestId, 'account_deleting', 'Account is being deleted')
    case 'profile_not_found':
      return apiError(requestId, 'unauthorized', 'Access token is not valid')
    case 'pending_request_exists':
      return apiError(requestId, 'conflict', 'A request is already pending')
    case 'credits_remaining':
      return apiError(requestId, 'conflict', 'Checks are still available on the balance')
    case 'telegram_dispatch_failed':
      console.error(`[${requestId}] extra check request not delivered:`, result.message)
      return apiError(requestId, 'dependency_unavailable', 'Could not reach the reviewer')
    default:
      console.error(`[${requestId}] extra check request failed:`, result.message)
      return apiError(requestId, 'internal_error', 'Could not create the request')
  }
}
