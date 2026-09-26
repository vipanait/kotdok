import { NextRequest, NextResponse } from 'next/server'
import { FeedbackInputSchema, UuidSchema } from '@lapka/contracts'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { owesConsent } from '@/server/consent/consent-service'
import { createServiceClient } from '@/server/supabase/server'
import { getCheckFeedback, submitFeedback } from '@/server/feedback/feedback-service'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await owesConsent(user.id)) return NextResponse.json({ error: 'Consent required' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // The same contract as the mobile route, so the two cannot drift apart.
  const parsed = FeedbackInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const result = await submitFeedback(createServiceClient(), user.id, {
    checkId: parsed.data.check_id,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  })

  if (!result.ok) {
    switch (result.reason) {
      case 'too_many_requests':
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      case 'account_deleting':
        return NextResponse.json({ error: 'Account is being deleted' }, { status: 403 })
      case 'account_not_found':
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      case 'not_found':
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      default:
        return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

/** The opinion already given on one check: `?check_id=`. */
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await owesConsent(user.id)) return NextResponse.json({ error: 'Consent required' }, { status: 403 })

  const checkId = request.nextUrl.searchParams.get('check_id')
  if (!UuidSchema.safeParse(checkId).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await getCheckFeedback(createServiceClient(), user.id, checkId!)
  if (!result.ok) {
    switch (result.reason) {
      case 'account_deleting':
        return NextResponse.json({ error: 'Account is being deleted' }, { status: 403 })
      case 'account_not_found':
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      case 'not_found':
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      default:
        return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 })
    }
  }

  return NextResponse.json({ rating: result.rating })
}
