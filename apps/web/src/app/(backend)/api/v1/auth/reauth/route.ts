import { NextRequest } from 'next/server'
import { ReauthProofSchema, ReauthRequestSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { apiError, apiSuccess } from '@/server/api/response'
import { readBearerToken } from '@/server/api/bearer-auth'
import { readJson } from '@/server/api/request'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import { authenticatedAt, isFresh, issueReauthProof } from '@/server/auth/reauth'

/**
 * Mints a proof that the caller authenticated a moment ago (stage 5/08).
 *
 * The freshness is not taken on anybody's word: it is read from the `amr` claim
 * of the token this request already arrived with and Supabase already verified.
 * That claim records when the person actually signed in and does not move when
 * the token is refreshed, so a long-lived session cannot talk its way past it.
 *
 * A stale session is answered with `reauth_required` rather than `unauthorized`
 * because the two ask for different things: sign in again, versus you are
 * signed in but must prove it is you.
 */
export const POST = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const parsed = await readJson(request, ReauthRequestSchema, context)
  if (!parsed.ok) return parsed.response

  // Safe to read without verifying: `withApiAuth` has already had Supabase
  // check this exact token. See the note in `server/auth/reauth.ts`.
  const token = readBearerToken(request)
  if (!token || !isFresh(authenticatedAt(token))) {
    return apiError(context.requestId, 'reauth_required', 'Authenticate again to continue')
  }

  const proof = await issueReauthProof(
    createServiceClient(),
    context.account.userId,
    parsed.data.operation,
  )

  if (!proof) {
    return apiError(context.requestId, 'internal_error', 'Could not issue the proof')
  }

  return apiSuccess(
    context.requestId,
    ReauthProofSchema.parse({ token: proof.token, expires_at: proof.expiresAt.toISOString() }),
  )
}, { consent: 'skip' })
