import 'server-only'

import { timingSafeEqual } from 'node:crypto'

type ExtraCheckAction = 'approve' | 'reject'

interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
}

interface TelegramSendMessageResult {
  message_id: number
  chat: {
    id: number
  }
}

function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('telegram_bot_token_missing')
  return token
}

export function getTelegramApprovalChatId(): string {
  const chatId = process.env.TELEGRAM_APPROVAL_CHAT_ID
  if (!chatId) throw new Error('telegram_approval_chat_id_missing')
  return chatId
}

export function getTelegramWebhookSecret(): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) throw new Error('telegram_webhook_secret_missing')
  return secret
}

/**
 * Does this request carry the secret Telegram was told to send?
 *
 * Fails closed: a deployment with no secret configured refuses every caller.
 * The webhook approves extra checks, which spend money, so "not configured"
 * has to mean "nobody gets in" rather than "everybody does".
 */
export function isTelegramWebhookAuthorized(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false
  const expected = Buffer.from(secret, 'utf8')
  const actual = Buffer.from(header, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * Did this callback come from the chat the approval buttons were posted to?
 *
 * Telegram does not check that callback data matches a button it sent, so the
 * chat is what ties a decision back to the reviewers.
 */
export function isApprovalChat(chatId: number | undefined, expected: string): boolean {
  return chatId != null && String(chatId) === expected
}

function buildTelegramApiUrl(method: string): string {
  return `https://api.telegram.org/bot${getTelegramBotToken()}/${method}`
}

async function postTelegram<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(buildTelegramApiUrl(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`telegram_http_error:${response.status}`)
  }

  const data = await response.json() as TelegramApiResponse<T>
  if (!data.ok || !data.result) {
    throw new Error(`telegram_api_error:${data.description ?? 'unknown'}`)
  }

  return data.result
}

export async function sendExtraCheckRequestToTelegram(input: {
  requestId: string
  userId: string
  previousRequestsCount: number
}): Promise<{ chatId: number; messageId: number }> {
  const chatId = getTelegramApprovalChatId()
  const text = [
    'Запрос на новую проверку симптомов',
    `request_id: ${input.requestId}`,
    `user_id: ${input.userId}`,
    '',
    `Уже было запрошено проверок: ${input.previousRequestsCount}`,
  ].join('\n')

  const result = await postTelegram<TelegramSendMessageResult>('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[
        { text: 'Подтвердить (+1)', callback_data: `extra_check:${input.requestId}:approve` },
        { text: 'Отклонить', callback_data: `extra_check:${input.requestId}:reject` },
      ]],
    },
  })

  return {
    chatId: result.chat.id,
    messageId: result.message_id,
  }
}

export async function answerTelegramCallbackQuery(input: {
  callbackQueryId: string
  text: string
}): Promise<void> {
  await postTelegram<Record<string, never>>('answerCallbackQuery', {
    callback_query_id: input.callbackQueryId,
    text: input.text,
    show_alert: false,
  })
}

export async function editTelegramMessageAfterDecision(input: {
  chatId: number
  messageId: number
  action: ExtraCheckAction
  status: string
}): Promise<void> {
  const suffix = input.status === 'already_resolved'
    ? 'Уже обработано'
    : input.action === 'approve'
      ? 'Подтверждено (+1 проверка начислена)'
      : 'Отклонено'

  await postTelegram<Record<string, unknown>>('editMessageText', {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: `Запрос на новую проверку симптомов\n\nСтатус: ${suffix}`,
    reply_markup: { inline_keyboard: [] },
  })
}
