import { NextRequest } from 'next/server'
import { UploadRequestSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { apiError, apiSuccess } from '@/server/api/response'
import { readJson } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { grantUploads } from '@/server/uploads/photo-storage'

/**
 * Permission to put photos into private storage (stage 6/01).
 *
 * The files themselves never come here: Vercel would refuse a body of a few
 * phone photos before this code ran. The phone PUTs each one to the URL it gets
 * back, then names the upload ids when it creates the check.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const parsed = await readJson(request, UploadRequestSchema, context)
  if (!parsed.ok) return parsed.response

  const supabase = createServiceClient()
  const rate = await consumeRateLimit(supabase, 'upload_create', context.account.userId)
  if (!rate.allowed) {
    return apiError(context.requestId, 'rate_limited', 'Too many uploads, try again later.')
  }

  const grant = await grantUploads(supabase, context.account.userId, parsed.data.files)
  if (!grant) {
    return apiError(context.requestId, 'dependency_unavailable', 'Storage is unavailable')
  }

  return apiSuccess(context.requestId, grant, 201)
})
