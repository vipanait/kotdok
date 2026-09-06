import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Rate limits for the operations worth protecting: the expensive ones (an AI
 * call), the ones that hand out credit, and the one that can be polled without
 * a session.
 *
 * The counter lives in the shared database, so two server instances spend one
 * allowance rather than one each.
 */
export const RATE_LIMITS = {
  /** An analysis costs an AI call and a credit. */
  analysis_create: { limit: 10, windowSeconds: 60 * 60 },
  /** Asking for a free extra check notifies a human. */
  extra_check_request: { limit: 5, windowSeconds: 60 * 60 },
  /** Feedback already has a 24h cooldown; this stops hammering the endpoint. */
  feedback_submit: { limit: 10, windowSeconds: 24 * 60 * 60 },
  /** Pollable without a session, so it is limited by receipt, not by user. */
  deletion_status: { limit: 60, windowSeconds: 60 * 60 },
} as const

export type RateLimitName = keyof typeof RATE_LIMITS

export type RateLimitVerdict = {
  allowed: boolean
  remaining: number
  resetAt: string
}

/**
 * Spends one unit of the caller's allowance for an operation.
 *
 * `subject` is what the allowance belongs to — a user id, or a receipt hash for
 * routes with no session. It is never a raw secret: hash before passing one in.
 *
 * A database failure allows the request rather than blocking the product on the
 * limiter, and says so in the log.
 */
export async function consumeRateLimit(
  supabase: SupabaseService,
  name: RateLimitName,
  subject: string,
  now?: Date,
): Promise<RateLimitVerdict> {
  const { limit, windowSeconds } = RATE_LIMITS[name]

  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_bucket: `${name}:${subject}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
    ...(now ? { p_now: now.toISOString() } : {}),
  })

  if (error || !data) {
    console.error(`rate limit check failed for ${name}, allowing the request:`, error?.message)
    return { allowed: true, remaining: limit, resetAt: new Date().toISOString() }
  }

  const verdict = data as { allowed: boolean; remaining: number; reset_at: string }
  return { allowed: verdict.allowed, remaining: verdict.remaining, resetAt: verdict.reset_at }
}
