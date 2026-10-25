import { NextRequest } from 'next/server'
import { HealthEventPatchSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { deleteEvent, eventStatus, updateEvent } from '@/server/medical-record/event-service'
import { isPastDay } from '@/server/medical-record/weight-service'
import { apiError, apiNoContent, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { readJson, readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; eventId: string }> }

/**
 * A correction of a plan, or «Перенести»: a plan moves only forward. A done
 * record is history (owner rule of 26 September 2026): any change of it is
 * `record_done`, 409 — `refuseDoneChange` in the event service decides.
 */
export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, eventId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(eventId, context)
  if (refused) return refused

  const parsed = await readJson(request, HealthEventPatchSchema, context)
  if (!parsed.ok) return parsed.response

  const supabase = createServiceClient()
  const userId = context.account.userId

  if (parsed.data.date) {
    const current = await eventStatus(supabase, userId, id, eventId)
    if (!current.ok) return serviceFailureResponse(context.requestId, current.reason)
    // A done record's day is not checked here: the service refuses the whole change.
    if (current.data.status === 'planned' && isPastDay(parsed.data.date)) {
      return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
    }
  }

  const result = await updateEvent(supabase, userId, id, eventId, parsed.data)
  if (!result.ok) {
    if (result.reason === 'record_done') {
      return apiError(context.requestId, 'record_done', 'A done record cannot be changed')
    }
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
  const { id, eventId } = await params.params
  const refused = readUuidParam(id, context) ?? readUuidParam(eventId, context)
  if (refused) return refused

  const result = await deleteEvent(createServiceClient(), context.account.userId, id, eventId)
  if (!result.ok) return serviceFailureResponse(context.requestId, result.reason)

  return apiNoContent(context.requestId)
})
