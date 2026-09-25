import { NextRequest } from 'next/server'
import { UuidSchema, VisitPatchSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { readEvent } from '@/server/medical-record/event-service'
import { updateVisit } from '@/server/medical-record/visit-service'
import { isFutureDay, isPastDay } from '@/server/medical-record/weight-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { serviceFailureResponse } from '@/server/api/failure-response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ id: string; eventId: string }> }

/**
 * A correction, or «Был» on a plan (`status: 'done'`). A plan takes no
 * diagnosis or prescriptions until it is marked done (MR-07.3); a done visit
 * stays in the past, a plan moves only forward.
 */
export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext, params: Params) => {
  const { id, eventId } = await params.params
  if (!UuidSchema.safeParse(id).success || !UuidSchema.safeParse(eventId).success) {
    return apiError(context.requestId, 'not_found', 'No such resource')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = VisitPatchSchema.safeParse(body)
  if (!parsed.success) return apiError(context.requestId, 'bad_request', 'Body does not match the contract')

  const supabase = createServiceClient()
  const userId = context.account.userId
  const current = await readEvent(supabase, userId, id, eventId)
  if (!current.ok) return serviceFailureResponse(context.requestId, current.reason)
  if (current.data.kind !== 'visit') return apiError(context.requestId, 'not_found', 'No such resource')

  const status = parsed.data.status ?? current.data.status
  const treatment = parsed.data.diagnosis || (parsed.data.prescriptions && parsed.data.prescriptions.length > 0)
  const date = parsed.data.date
  const wrongDay = date !== undefined && (status === 'done' ? isFutureDay(date) : isPastDay(date))
  // Marking done without a new day means it happened on the planned one, which must have come.
  const doneAhead = parsed.data.status === 'done' && date === undefined && isFutureDay(current.data.date)
  if ((status === 'planned' && treatment) || wrongDay || doneAhead) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const result = await updateVisit(supabase, userId, id, eventId, parsed.data, current.data)
  if (!result.ok) {
    if (result.reason === 'bad_check') return apiError(context.requestId, 'bad_request', 'The check is not of this pet')
    return serviceFailureResponse(context.requestId, result.reason)
  }
  return apiSuccess(context.requestId, result.data)
})
