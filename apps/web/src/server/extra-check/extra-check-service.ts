import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { sendExtraCheckRequestToTelegram } from './telegram'

type ResolveAction = 'approve' | 'reject'

interface RpcErrorLike {
  message?: string
}

function getErrorCode(error: RpcErrorLike | null): string {
  return error?.message ?? 'unknown_error'
}

async function loadPreviousRequestsCount(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  currentRequestId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('extra_check_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('id', currentRequestId)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

/**
 * The status of the user's most recent request, or null if they never asked.
 * The dashboard reads the same row; this is the API's way in.
 */
export async function readExtraCheckRequestStatus(
  userId: string,
): Promise<'pending' | 'approved' | 'rejected' | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('extra_check_requests')
    .select('status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data?.status ?? null) as 'pending' | 'approved' | 'rejected' | null
}

/** Why a request for a free extra check was not made. */
export type SubmitExtraCheckFailure =
  | 'rate_limited'
  /** The database raised it: one request at a time. */
  | 'pending_request_exists'
  /** The database raised it: the balance is not empty yet. */
  | 'credits_remaining'
  | 'account_deleting'
  | 'profile_not_found'
  /** The reviewers could not be told; the pending row is gone again. */
  | 'telegram_dispatch_failed'
  | 'storage_error'

export type SubmitExtraCheckResult =
  | { ok: true; requestId: string }
  /** `message` is the driver's or Telegram's words, for the log only. */
  | { ok: false; reason: SubmitExtraCheckFailure; message?: string }

const RAISED_BY_RPC = new Set<SubmitExtraCheckFailure>(['pending_request_exists', 'credits_remaining', 'profile_not_found'])

/**
 * Asks the reviewers for one more check. Returns what happened rather than
 * throwing: the route maps the reasons to its codes, so nothing here has to
 * be string-matched out of an error message.
 */
export async function submitExtraCheckRequest(userId: string): Promise<SubmitExtraCheckResult> {
  const supabase = createServiceClient()

  // Same guard every service goes through: a missing or deleting account may
  // not start new work.
  const account = await loadAccount(supabase, userId)
  if (!account.ok) {
    return { ok: false, reason: account.reason === 'account_deleting' ? 'account_deleting' : 'profile_not_found' }
  }

  const rate = await consumeRateLimit(supabase, 'extra_check_request', userId)
  if (!rate.allowed) return { ok: false, reason: 'rate_limited' }

  const { data, error } = await supabase.rpc('create_extra_check_request', {
    p_user_id: userId,
  })

  if (error) {
    // The function raises its refusals by name; anything else is the storage.
    const raised = getErrorCode(error) as SubmitExtraCheckFailure
    return RAISED_BY_RPC.has(raised) ? { ok: false, reason: raised } : { ok: false, reason: 'storage_error', message: error.message }
  }

  const requestId = (data as { request_id?: string } | null)?.request_id
  if (!requestId) return { ok: false, reason: 'storage_error', message: 'extra_check_request_not_created' }

  try {
    const previousRequestsCount = await loadPreviousRequestsCount(supabase, userId, requestId)
    const telegramMessage = await sendExtraCheckRequestToTelegram({
      requestId,
      userId,
      previousRequestsCount,
    })
    const { error: updateError } = await supabase
      .from('extra_check_requests')
      .update({
        telegram_chat_id: telegramMessage.chatId,
        telegram_message_id: telegramMessage.messageId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending')
    if (updateError) {
      throw new Error(updateError.message)
    }
  } catch (errorDuringTelegram) {
    // A request the reviewers never saw must not sit there as pending.
    await supabase
      .from('extra_check_requests')
      .delete()
      .eq('id', requestId)
      .eq('status', 'pending')
    return {
      ok: false,
      reason: 'telegram_dispatch_failed',
      message: errorDuringTelegram instanceof Error ? errorDuringTelegram.message : String(errorDuringTelegram),
    }
  }

  return { ok: true, requestId }
}

export async function resolveExtraCheckRequest(input: {
  requestId: string
  action: ResolveAction
  adminTelegramId?: number
  adminUsername?: string | null
}): Promise<{ status: string; requestStatus?: string; newBalance?: number | null }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('resolve_extra_check_request', {
    p_request_id: input.requestId,
    p_action: input.action,
    p_admin_telegram_id: input.adminTelegramId ?? null,
    p_admin_username: input.adminUsername ?? null,
  })

  if (error) {
    throw new Error(getErrorCode(error))
  }

  const payload = (data ?? {}) as { status?: string; request_status?: string; new_balance?: number | null }
  return {
    status: payload.status ?? 'unknown',
    requestStatus: payload.request_status,
    newBalance: payload.new_balance ?? null,
  }
}
