import { NextRequest } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { getCheckJob } from '@/server/checks/check-job-service'
import { apiError, apiSuccess } from '@/server/api/response'
import { readUuidParam } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

type Params = { params: Promise<{ job_id: string }> }

/**
 * The state of one analysis.
 *
 * A job belonging to someone else answers exactly as one that never existed, so
 * ids cannot be probed for whether they are real. A malformed id is answered the
 * same way, for the same reason.
 */
export const GET = withApiAuth<Params>(
  async (_request: NextRequest, context: ApiContext, params: Params) => {
    const { job_id: jobId } = await params.params
    const refused = readUuidParam(jobId, context)
    if (refused) return refused

    const job = await getCheckJob(createServiceClient(), context.account.userId, jobId)
    if (!job) return apiError(context.requestId, 'not_found', 'No such resource')

    return apiSuccess(context.requestId, job)
  },
)
