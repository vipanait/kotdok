import 'server-only'

import { createServiceClient } from '@/server/supabase/server'
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

export async function submitExtraCheckRequest(userId: string): Promise<{ requestId: string }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('create_extra_check_request', {
    p_user_id: userId,
  })

  if (error) {
    throw new Error(getErrorCode(error))
  }

  const requestId = (data as { request_id?: string } | null)?.request_id
  if (!requestId) {
    throw new Error('extra_check_request_not_created')
  }

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
    await supabase
      .from('extra_check_requests')
      .delete()
      .eq('id', requestId)
      .eq('status', 'pending')
    throw new Error(
      `telegram_dispatch_failed:${errorDuringTelegram instanceof Error ? errorDuringTelegram.message : String(errorDuringTelegram)}`,
    )
  }

  return { requestId }
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
