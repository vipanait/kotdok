import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import type { FeedbackRating } from '@/shared/types'

type SupabaseService = ReturnType<typeof createServiceClient>

/** How long a user has to wait before sending feedback again. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000
const COMMENT_MAX = 500

export type FeedbackFailure =
  | 'account_deleting'
  | 'account_not_found'
  | 'too_many_requests'
  | 'storage_error'

export type FeedbackResult = { ok: true } | { ok: false; reason: FeedbackFailure }

/**
 * Stores one piece of feedback and marks the profile, so the prompt is not
 * shown again. Returns plain outcomes; the adapter maps them to statuses.
 */
export async function submitFeedback(
  supabase: SupabaseService,
  userId: string,
  input: { rating: FeedbackRating; comment?: string },
  now: Date = new Date(),
): Promise<FeedbackResult> {
  const account = await loadAccount(supabase, userId)
  if (!account.ok) {
    return {
      ok: false,
      reason: account.reason === 'account_deleting' ? 'account_deleting' : 'account_not_found',
    }
  }

  const since = new Date(now.getTime() - COOLDOWN_MS).toISOString()
  const { data: recentFeedback } = await supabase
    .from('user_feedback')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()

  if (recentFeedback) return { ok: false, reason: 'too_many_requests' }

  const { error: insertError } = await supabase
    .from('user_feedback')
    .insert({
      user_id: userId,
      rating: input.rating,
      comment: input.comment?.slice(0, COMMENT_MAX) ?? null,
    })

  if (insertError) {
    console.error('feedback insert error:', insertError)
    return { ok: false, reason: 'storage_error' }
  }

  // Best effort: the feedback is already stored, so a failure here must not be
  // reported to the user as a failure to save it.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ feedback_submitted_at: now.toISOString() })
    .eq('id', userId)

  if (profileError) console.error('feedback profile update error:', profileError)

  return { ok: true }
}
