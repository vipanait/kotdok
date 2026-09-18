import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { submitExtraCheckRequest } from '@/server/extra-check/extra-check-service'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

/**
 * What the caller is told, and with which status.
 *
 * Only the cases this route knows get named. Anything else — a PostgREST
 * message, what Telegram thought of the request, an OpenAI failure — is the
 * inside of the system: it names tables, constraints and hosts, tells the
 * reader nothing they can act on, and is read by whoever asked, not only by us.
 */
function failureFor(message: string): { error: string; status: number } {
  if (message.includes('Unauthorized')) return { error: 'Unauthorized', status: 401 }
  if (message.includes('rate_limited')) return { error: 'rate_limited', status: 429 }
  if (message.includes('account_deleting')) return { error: 'account_deleting', status: 403 }
  if (message.includes('profile_not_found')) return { error: 'profile_not_found', status: 404 }
  if (message.includes('credits_remaining')) return { error: 'credits_remaining', status: 409 }
  if (message.includes('pending_request_exists')) {
    return { error: 'pending_request_exists', status: 409 }
  }
  if (message.startsWith('telegram_dispatch_failed:')) {
    return { error: 'telegram_dispatch_failed', status: 502 }
  }
  return { error: 'request_failed', status: 500 }
}

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { requestId } = await submitExtraCheckRequest(user.id)
    return NextResponse.json({
      status: 'pending',
      request_id: requestId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_extra_check_request_failed'
    const failure = failureFor(message)
    // The detail stays here, where it is useful, rather than going out in the
    // response.
    if (failure.status >= 500) console.error('extra check request failed:', error)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
}
