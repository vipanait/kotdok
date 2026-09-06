import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createServiceClient } from '@/server/supabase/server'
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
    comment = typeof body.comment === 'string' ? body.comment.slice(0, 500) : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentFeedback } = await supabase
    .from('user_feedback')
    .select('id')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()

  if (recentFeedback) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { error: insertError } = await supabase
    .from('user_feedback')
    .insert({ user_id: user.id, rating, comment: comment ?? null })

  if (insertError) {
    console.error('feedback insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ feedback_submitted_at: new Date().toISOString() })
    .eq('id', user.id)

  if (profileError) {
    console.error('feedback profile update error:', profileError)
  }

  return NextResponse.json({ ok: true })
}
