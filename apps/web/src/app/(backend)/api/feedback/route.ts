import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createServiceClient } from '@/server/supabase/server'
import { submitFeedback } from '@/server/feedback/feedback-service'
import type { FeedbackRating } from '@/shared/types'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let rating: FeedbackRating
  let comment: string | undefined

  try {
    const body = await request.json() as { rating?: unknown; comment?: unknown }
    if (body.rating !== 'liked' && body.rating !== 'disliked') {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
    }
    rating = body.rating
    comment = typeof body.comment === 'string' ? body.comment : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const result = await submitFeedback(createServiceClient(), user.id, { rating, comment })

  if (!result.ok) {
    switch (result.reason) {
      case 'too_many_requests':
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      case 'account_deleting':
        return NextResponse.json({ error: 'Account is being deleted' }, { status: 403 })
      case 'account_not_found':
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      default:
        return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
