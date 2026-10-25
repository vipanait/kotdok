import { FollowupCaseSummarySchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { setFollowupRecord } from '@/server/followup/followup-service'
import { apiSuccess } from '@/server/api/response'
import { serviceOrRateFailureResponse } from '@/server/api/failure-response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ caseId: string }> }

async function handle(context: ApiContext, params: Params, saved: boolean) {
  const { caseId } = await params.params
  const refused = readUuidParam(caseId, context)
  if (refused) return refused

  const result = await setFollowupRecord(createServiceClient(), context.account.userId, caseId, saved)
  if (!result.ok) return serviceOrRateFailureResponse(context.requestId, result.reason)
  return apiSuccess(context.requestId, FollowupCaseSummarySchema.parse(result.data))
}

/** Keeps a closed case in «Перенесённые случаи». Repeating it changes nothing. 409 if the case is open. */
export const PUT = withApiAuth((_request, context: ApiContext, params: Params) => handle(context, params, true))

/** Takes the case out of «Перенесённые случаи». */
export const DELETE = withApiAuth((_request, context: ApiContext, params: Params) => handle(context, params, false))
