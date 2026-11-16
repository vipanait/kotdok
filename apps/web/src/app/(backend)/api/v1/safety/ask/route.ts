import { NextRequest } from 'next/server'
import { SafetyAskInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { askSafety } from '@/server/safety/ask-safety'
import { apiError, apiSuccess } from '@/server/api/response'
import { readJson } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

/** One model attempt of at most 30 s, plus the knowledge search and the database around it. */
export const maxDuration = 60

/**
 * «Спросить ИИ»: the reference entry when it turns out to hold the query,
 * otherwise the model's answer after the server's guards. Someone else's or
 * a deleted pet is 404; the eleventh model call of the day is 429.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const parsed = await readJson(request, SafetyAskInputSchema, context)
  if (!parsed.ok) return parsed.response

  const result = await askSafety(createServiceClient(), {
    userId: context.account.userId,
    query: parsed.data.query,
    petId: parsed.data.pet_id,
    species: parsed.data.species,
    locale: context.account.locale,
  })
  if (result.ok) return apiSuccess(context.requestId, result.data)

  switch (result.code) {
    case 'bad_request':
      return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
    case 'rate_limited':
      return apiError(context.requestId, 'rate_limited', 'No AI answers left today')
    case 'not_found':
      return apiError(context.requestId, 'not_found', 'No such resource')
    default:
      return apiError(context.requestId, 'internal_error', 'Could not get an answer')
  }
})
