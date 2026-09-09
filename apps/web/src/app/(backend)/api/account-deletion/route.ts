import { NextRequest, NextResponse } from 'next/server'
import { AccountDeletionRequestSchema } from '@lapka/contracts'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'
import { createServiceClient } from '@/server/supabase/server'
import { requestAccountDeletion } from '@/server/account/deletion-service'

/**
 * The site's way in to account deletion (stage 9/03).
 *
 * A cookie session and a CSRF token instead of a Bearer token — the old web
 * adapter's rules, because the browser is where cookies get sent by anybody who
 * can make the browser send them. Everything past that point is the same code
 * the phone reaches through `/api/v1/account-deletion`: one service, one set of
 * rules about proof and idempotency, so the two clients cannot drift into
 * disagreeing about what deleting an account means.
 *
 * Being able to open this page is not permission to delete anything. Three
 * separate things are required and each is checked here: a session that belongs
 * to somebody, a CSRF token proving the request came from our own page, and a
 * proof of fresh authentication from `/api/v1/auth/reauth`.
 *
 * The answer is `202`, never `200`. The request has been accepted; the deletion
 * has not happened yet, and saying otherwise would be a lie the person acts on.
 */
export async function POST(request: NextRequest) {
  if (!(await verifyCsrf(request))) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 })
  }

  const parsed = AccountDeletionRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Body does not match the contract' }, { status: 400 })
  }

  const outcome = await requestAccountDeletion(createServiceClient(), {
    userId: user.id,
    receiptSecret: parsed.data.receipt_secret,
    reauthToken: parsed.data.reauth_token,
  })

  if (!outcome.ok) {
    const status = outcome.reason === 'reauth_required' ? 401 : outcome.reason === 'not_found' ? 404 : 500
    return NextResponse.json({ error: outcome.reason }, { status })
  }

  const response = NextResponse.json({ status: 'accepted' }, { status: 202 })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
