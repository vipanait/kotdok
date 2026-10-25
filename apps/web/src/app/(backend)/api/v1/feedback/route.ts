import { NextRequest } from 'next/server'
import { FeedbackInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { submitFeedback } from '@/server/feedback/feedback-service'
import { apiError, apiNoContent } from '@/server/api/response'
import { readJson } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const parsed = await readJson(request, FeedbackInputSchema, context)
  if (!parsed.ok) return parsed.response

  const result = await submitFeedback(createServiceClient(), context.account.userId, {
    checkId: parsed.data.check_id,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  })

  if (!result.ok) {
    switch (result.reason) {
      case 'too_many_requests':
        return apiError(context.requestId, 'rate_limited', 'Too many requests')
      case 'account_deleting':
        return apiError(context.requestId, 'account_deleting', 'Account is being deleted')
      case 'account_not_found':
        return apiError(context.requestId, 'unauthorized', 'Access token is not valid')
      case 'not_found':
        return apiError(context.requestId, 'not_found', 'No such resource')
      default:
        // A storage failure must never be reported as a stored opinion.
        return apiError(context.requestId, 'internal_error', 'Could not save the feedback')
    }
  }

  return apiNoContent(context.requestId)
})
