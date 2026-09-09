import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/server/auth/get-auth-session'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'
import { createServiceClient } from '@/server/supabase/server'
import { authenticatedAt, isFresh, issueReauthProof } from '@/server/auth/reauth'

/**
 * The site's way to prove a fresh authentication (stage 9/02).
 *
 * The same rule as `/api/v1/auth/reauth` and the same code behind it; only the
 * way the caller is identified differs, because a browser carries cookies where
 * a phone carries a Bearer token. Freshness is read from the session's `amr`
 * claim either way, so signing in on the page *is* the proof — which is what
 * "confirm ownership without installing the app" comes down to.
 */
export async function POST(request: NextRequest) {
  if (!(await verifyCsrf(request))) return csrfForbiddenResponse()

  const session = await getAuthSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isFresh(authenticatedAt(session.accessToken))) {
    return NextResponse.json({ error: 'reauth_required' }, { status: 401 })
  }

  const proof = await issueReauthProof(createServiceClient(), session.user.id, 'account_deletion')
  if (!proof) return NextResponse.json({ error: 'internal_error' }, { status: 500 })

  const response = NextResponse.json({
    token: proof.token,
    expires_at: proof.expiresAt.toISOString(),
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
