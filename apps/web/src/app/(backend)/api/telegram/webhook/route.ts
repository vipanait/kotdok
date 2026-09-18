import { NextRequest, NextResponse } from 'next/server'
import { resolveExtraCheckRequest } from '@/server/extra-check/extra-check-service'
import {
  answerTelegramCallbackQuery,
  editTelegramMessageAfterDecision,
  getTelegramApprovalChatId,
  isApprovalChat,
  isTelegramWebhookAuthorized,
} from '@/server/extra-check/telegram'

interface CallbackQueryUpdate {
  callback_query?: {
    id: string
    data?: string
    from?: {
      id?: number
      username?: string
    }
    message?: {
      message_id?: number
      chat?: { id?: number }
    }
  }
}

const CALLBACK_PATTERN = /^extra_check:([0-9a-f-]{36}):(approve|reject)$/i

function parseCallbackData(data: string | undefined): { requestId: string; action: 'approve' | 'reject' } | null {
  if (!data) return null
  const match = data.match(CALLBACK_PATTERN)
  if (!match) return null
  return {
    requestId: match[1],
    action: match[2].toLowerCase() as 'approve' | 'reject',
  }
}

function hasValidSecret(request: NextRequest): boolean {
  return isTelegramWebhookAuthorized(
    request.headers.get('x-telegram-bot-api-secret-token'),
    process.env.TELEGRAM_WEBHOOK_SECRET,
  )
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: CallbackQueryUpdate
  try {
    body = await request.json() as CallbackQueryUpdate
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const callbackQuery = body.callback_query
  if (!callbackQuery) return NextResponse.json({ ok: true })

  // A decision only counts from the chat the buttons were posted to: Telegram
  // does not check that callback data belongs to a button it sent.
  if (!isApprovalChat(callbackQuery.message?.chat?.id, getTelegramApprovalChatId())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const parsed = parseCallbackData(callbackQuery.data)
  if (!parsed) {
    await answerTelegramCallbackQuery({
      callbackQueryId: callbackQuery.id,
      text: 'Unknown action',
    })
    return NextResponse.json({ ok: true })
  }

  try {
    const result = await resolveExtraCheckRequest({
      requestId: parsed.requestId,
      action: parsed.action,
      adminTelegramId: callbackQuery.from?.id,
      adminUsername: callbackQuery.from?.username ?? null,
    })

    if (callbackQuery.message?.chat?.id != null && callbackQuery.message?.message_id != null) {
      await editTelegramMessageAfterDecision({
        chatId: callbackQuery.message.chat.id,
        messageId: callbackQuery.message.message_id,
        action: parsed.action,
        status: result.status,
      })
    }

    const answerText = result.status === 'already_resolved'
      ? `Already resolved (${result.requestStatus ?? 'unknown'})`
      : parsed.action === 'approve'
        ? 'Approved: +1 check granted'
        : 'Request rejected'

    await answerTelegramCallbackQuery({
      callbackQueryId: callbackQuery.id,
      text: answerText,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    await answerTelegramCallbackQuery({
      callbackQueryId: callbackQuery.id,
      text: 'Failed to resolve request',
    })
    console.error('telegram webhook resolve error:', error)
    return NextResponse.json({ ok: true })
  }
}
