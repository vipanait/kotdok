import { NextRequest } from 'next/server'
import { FeedbackInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { submitFeedback } from '@/server/feedback/feedback-service'
import { apiError, apiNoContent } from '@/server/api/response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = FeedbackInputSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await submitFeedback(createServiceClient(), context.account.userId, parsed.data)

  if (!result.ok) {
    switch (result.reason) {
      case 'too_many_requests':
        return apiError(context.requestId, 'rate_limited', 'Too many requests')
      case 'account_deleting':
        return apiError(context.requestId, 'account_deleting', 'Account is being deleted')
      case 'account_not_found':
        return apiError(context.requestId, 'unauthorized', 'Access token is not valid')
      default:
        // A storage failure must never be reported as a stored opinion.
        return apiError(context.requestId, 'internal_error', 'Could not save the feedback')
    }
  }

  return apiNoContent(context.requestId)
})
