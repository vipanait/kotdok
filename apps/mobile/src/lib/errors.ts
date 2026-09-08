/**
 * What went wrong, said in Russian.
 *
 * Supabase answers in English and the API answers in codes, and both used to
 * reach the screen untouched: a person filling in a Russian form was told
 * "Invalid login credentials". Translating by code rather than by message text
 * is deliberate — the codes are contractual, the sentences are not, and a
 * reworded upstream message must not silently turn back into English here.
 */

import { ApiError, ApiTimeoutError } from '@lapka/shared'

/**
 * A message this app wrote itself.
 *
 * It is already in Russian and already says the one useful thing, so it is
 * passed through rather than replaced by a fallback. `kind` lets a screen
 * branch on which failure it was without matching on the sentence.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly kind: 'insufficient_credits' | 'analysis_failed' | 'still_running',
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/**
 * Supabase auth error codes.
 * https://supabase.com/docs/guides/auth/debugging/error-codes
 */
const authMessages: Record<string, string> = {
  invalid_credentials: 'Неверная почта или пароль',
  email_not_confirmed: 'Почта ещё не подтверждена. Откройте ссылку из письма',
  email_address_invalid: 'Проверьте адрес почты',
  email_exists: 'Такая почта уже зарегистрирована',
  user_already_exists: 'Такая почта уже зарегистрирована',
  weak_password: 'Пароль слишком простой — сделайте его длиннее',
  same_password: 'Это тот же пароль. Придумайте новый',
  over_email_send_rate_limit: 'Слишком много писем подряд. Попробуйте через минуту',
  over_request_rate_limit: 'Слишком много попыток. Попробуйте через минуту',
  validation_failed: 'Заполните оба поля',
  user_not_found: 'Такой учётной записи нет',
  session_expired: 'Сессия истекла. Войдите ещё раз',
  signup_disabled: 'Регистрация сейчас закрыта',
  otp_expired: 'Ссылка больше не действует',
}

/** The API's own codes, from `packages/contracts/src/errors.ts`. */
const apiMessages: Record<string, string> = {
  bad_request: 'Проверьте заполненные поля',
  unauthorized: 'Нужно войти заново',
  forbidden: 'Нет доступа',
  not_found: 'Не найдено',
  conflict: 'Это уже было сделано',
  insufficient_credits: 'Не хватает проверок на балансе',
  payload_too_large: 'Слишком много данных',
  unsupported_media_type: 'Неподдерживаемый формат',
  rate_limited: 'Слишком часто. Подождите немного',
  account_deleting: 'Учётная запись удаляется',
  dependency_unavailable: 'Сервис временно недоступен',
  internal_error: 'Что-то пошло не так на нашей стороне',
}

/** Supabase's errors carry a code; the type is not exported, so this asks. */
function codeOf(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null) return null
  const code = (cause as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

/**
 * @param fallback what to say when the cause is unrecognised — the screen knows
 * which action failed, and "Не удалось войти" beats a stray English sentence.
 */
export function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof AppError) return cause.message
  // Said apart from "no connection": the phone reached the server, the server
  // simply never answered, and a write may still have gone through.
  if (cause instanceof ApiTimeoutError) return 'Сервер не ответил. Попробуйте ещё раз'
  if (cause instanceof ApiError) return apiMessages[cause.code] ?? fallback

  const code = codeOf(cause)
  if (code && authMessages[code]) return authMessages[code]

  // Older Supabase releases and network failures arrive without a code. Their
  // message is English, so it is dropped rather than shown.
  return fallback
}

/** No connection at all, which is worth saying differently from a rejection. */
export function isOffline(cause: unknown): boolean {
  return cause instanceof TypeError || (cause instanceof Error && cause.name === 'AbortError')
}
