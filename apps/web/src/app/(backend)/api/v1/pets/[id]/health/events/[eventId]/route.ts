import { NextRequest } from 'next/server'
import { HealthEventPatchSchema, UuidSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { deleteEvent, eventStatus, updateEvent } from '@/server/medical-record/event-service'
import { isFutureDay, isPastDay } from '@/server/medical-record/weight-service'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; eventId: string }> }

async function readIds(params: Params): Promise<{ petId: string; eventId: string } | null> {
  const { id, eventId } = await params.params
  if (!UuidSchema.safeParse(id).success || !UuidSchema.safeParse(eventId).success) return null
  return { petId: id, eventId }
}

/** A correction, or «Перенести» on a plan: a plan moves forward, a done record stays in the past. */
export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const ids = await readIds(params)
  if (!ids) return apiError(context.requestId, 'not_found', 'No such resource')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = HealthEventPatchSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const supabase = createServiceClient()
  const userId = context.account.userId

  if (parsed.data.date) {
    const current = await eventStatus(supabase, userId, ids.petId, ids.eventId)
    if (!current.ok) return serviceFailureResponse(context.requestId, current.reason)
    const wrongDay =
      current.data.status === 'done' ? isFutureDay(parsed.data.date) : isPastDay(parsed.data.date)
    if (wrongDay) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await updateEvent(supabase, userId, ids.petId, ids.eventId, parsed.data)
  if (!result.ok) {
    if (result.reason === 'bad_product') {
      return apiError(context.requestId, 'bad_request', 'A product does not fit this pet')
    }
    if (result.reason === 'bad_target') {
      return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
    }
    return serviceFailureResponse(context.requestId, result.reason)
  }

  return apiSuccess(context.requestId, result.data)
})

/** Deletes a record or cancels a plan. */
export const DELETE = withApiAuth(async (_request, context: ApiContext, params: Params) => {
  const ids = await readIds(params)
  if (!ids) return apiError(context.requestId, 'not_found', 'No such resource')

  const result = await deleteEvent(createServiceClient(), context.account.userId, ids.petId, ids.eventId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiNoContent(context.requestId)
})
