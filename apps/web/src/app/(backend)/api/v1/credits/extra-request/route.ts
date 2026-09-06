import { ExtraCheckRequestStatusSchema } from '@lapka/contracts'
import {
  readExtraCheckRequestStatus,
  submitExtraCheckRequest,
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
  try {
    await submitExtraCheckRequest(context.account.userId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_extra_check_request_failed'

    if (message.includes('rate_limited')) {
      return apiError(context.requestId, 'rate_limited', 'Too many requests')
    }
    if (message.includes('account_deleting')) {
      return apiError(context.requestId, 'account_deleting', 'Account is being deleted')
    }
    if (message.includes('profile_not_found')) {
      return apiError(context.requestId, 'unauthorized', 'Access token is not valid')
    }
    if (message.includes('pending_request_exists')) {
      return apiError(context.requestId, 'conflict', 'A request is already pending')
    }
    if (message.includes('credits_remaining')) {
      return apiError(context.requestId, 'conflict', 'Checks are still available on the balance')
    }
    if (message.startsWith('telegram_dispatch_failed:')) {
      return apiError(context.requestId, 'dependency_unavailable', 'Could not reach the reviewer')
    }

    console.error(`[${context.requestId}] extra check request failed:`, message)
    return apiError(context.requestId, 'internal_error', 'Could not create the request')
  }

  const status = await readExtraCheckRequestStatus(context.account.userId)
  return apiSuccess(context.requestId, ExtraCheckRequestStatusSchema.parse({ status }))
})
