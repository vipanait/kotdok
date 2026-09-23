import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import { consumeRateLimit } from '@/server/api/rate-limit'
import type { FeedbackRating } from '@/shared/types'

type SupabaseService = ReturnType<typeof createServiceClient>

const COMMENT_MAX = 500

export type FeedbackFailure =
  | 'account_deleting'
  | 'account_not_found'
  | 'not_found'
  | 'too_many_requests'
  | 'storage_error'

export type FeedbackResult = { ok: true } | { ok: false; reason: FeedbackFailure }

export type CheckFeedbackResult =
  | { ok: true; rating: FeedbackRating | null }
  | { ok: false; reason: Exclude<FeedbackFailure, 'too_many_requests'> }

type AccessFailure = { ok: false; reason: 'account_deleting' | 'account_not_found' | 'not_found' | 'storage_error' }

/**
 * The account may act, and the check is one of its own that still shows.
 * Someone else's check is indistinguishable from one that never existed.
 */
async function requireOwnCheck(
  supabase: SupabaseService,
  userId: string,
  checkId: string,
): Promise<{ ok: true } | AccessFailure> {
  const account = await loadAccount(supabase, userId)
  if (!account.ok) {
    return {
      ok: false,
      reason: account.reason === 'account_deleting' ? 'account_deleting' : 'account_not_found',
    }
  }

  const { data, error } = await supabase
    .from('symptom_checks')
    .select('id')
    .eq('id', checkId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { ok: false, reason: 'storage_error' }
  if (!data) return { ok: false, reason: 'not_found' }
  return { ok: true }
}

/**
 * Stores the opinion on one check, replacing any earlier one on the same check.
 * Returns plain outcomes; the adapter maps them to statuses.
 */
export async function submitFeedback(
  supabase: SupabaseService,
  userId: string,
  input: { checkId: string; rating: FeedbackRating; comment?: string },
  now: Date = new Date(),
): Promise<FeedbackResult> {
  const access = await requireOwnCheck(supabase, userId, input.checkId)
  if (!access.ok) return access

  const rate = await consumeRateLimit(supabase, 'feedback_submit', userId, now)
  if (!rate.allowed) return { ok: false, reason: 'too_many_requests' }

  const { error } = await supabase
    .from('user_feedback')
    .upsert(
      {
        user_id: userId,
        symptom_check_id: input.checkId,
        rating: input.rating,
        comment: input.comment?.slice(0, COMMENT_MAX) ?? null,
        updated_at: now.toISOString(),
      },
      { onConflict: 'symptom_check_id' },
    )

  if (error) {
    console.error('feedback upsert error:', error)
    return { ok: false, reason: 'storage_error' }
  }

  return { ok: true }
}

/** The opinion already given on a check, so the result screen does not ask twice. */
export async function getCheckFeedback(
  supabase: SupabaseService,
  userId: string,
  checkId: string,
): Promise<CheckFeedbackResult> {
  const access = await requireOwnCheck(supabase, userId, checkId)
  if (!access.ok) return access

  const { data, error } = await supabase
    .from('user_feedback')
    .select('rating')
    .eq('symptom_check_id', checkId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { ok: false, reason: 'storage_error' }
  return { ok: true, rating: (data?.rating as FeedbackRating | undefined) ?? null }
}
