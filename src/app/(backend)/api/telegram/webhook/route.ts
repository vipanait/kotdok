import { NextRequest, NextResponse } from 'next/server'
import { resolveExtraCheckRequest } from '@/server/extra-check/extra-check-service'
import {
  answerTelegramCallbackQuery,
  editTelegramMessageAfterDecision,
  getOptionalTelegramWebhookSecret,
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
  const expected = getOptionalTelegramWebhookSecret()
  if (!expected) return true
  const actual = request.headers.get('x-telegram-bot-api-secret-token')
  return actual === expected
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await request.json() as CallbackQueryUpdate
  const callbackQuery = body.callback_query
  if (!callbackQuery) return NextResponse.json({ ok: true })

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
