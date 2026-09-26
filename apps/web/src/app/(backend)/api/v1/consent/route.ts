import { NextRequest } from 'next/server'
import { ConsentInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { consentStatus, recordConsent } from '@/server/consent/consent-service'

/** Reached before the consent exists, by definition. */
export const GET = withApiAuth(
  (_request, context: ApiContext) => apiSuccess(context.requestId, consentStatus(context.account)),
  { consent: 'skip' },
)

export const POST = withApiAuth(
  async (request: NextRequest, context: ApiContext) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
    }

    const parsed = ConsentInputSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
    }

    const result = await recordConsent(createServiceClient(), context.account.userId, parsed.data)
    if (!result.ok) {
      return result.reason === 'stale_version'
        ? apiError(context.requestId, 'bad_request', 'Not the current edition of the consent')
        : apiError(context.requestId, 'internal_error', 'Could not record the consent')
    }
    return apiNoContent(context.requestId)
  },
  { consent: 'skip' },
)
