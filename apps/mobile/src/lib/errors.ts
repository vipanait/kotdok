/**
 * What went wrong, said in Russian.
 *
 * Supabase answers in English and the API answers in codes, and both used to
 * reach the screen untouched: a person filling in a Russian form was told
 * "Invalid login credentials". Translating by code rather than by message text
 * is deliberate — the codes are contractual, the sentences are not, and a
 * reworded upstream message must not silently turn back into English here.
 */

import { ApiContractError, ApiError, ApiTimeoutError } from '@lapka/shared'
import type { Dictionary } from '@/i18n'

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
const authMessages = (t: Dictionary): Record<string, string> => ({
  invalid_credentials: t.errors.invalidCredentials,
  email_not_confirmed: t.errors.emailNotConfirmed,
  email_address_invalid: t.errors.emailInvalid,
  email_exists: t.errors.emailTaken,
  user_already_exists: t.errors.emailTaken,
  weak_password: t.errors.weakPassword,
  same_password: t.errors.samePassword,
  over_email_send_rate_limit: t.errors.tooManyEmails,
  over_request_rate_limit: t.errors.tooManyAttempts,
  validation_failed: t.errors.fillBoth,
  user_not_found: t.errors.noSuchAccount,
  session_expired: t.errors.sessionExpired,
  signup_disabled: t.errors.signUpClosed,
  otp_expired: t.auth.linkExpired,
})

/** The API's own codes, from `packages/contracts/src/errors.ts`. */
const apiMessages = (t: Dictionary): Record<string, string> => ({
  bad_request: t.errors.badRequest,
  unauthorized: t.errors.unauthorized,
  forbidden: t.errors.forbidden,
  not_found: t.errors.notFound,
  conflict: t.errors.conflict,
  insufficient_credits: t.errors.insufficientCredits,
  payload_too_large: t.errors.payloadTooLarge,
  unsupported_media_type: t.errors.unsupportedMedia,
  rate_limited: t.errors.rateLimited,
  account_deleting: t.errors.accountDeleting,
  reauth_required: t.errors.reauthRequired,
  dependency_unavailable: t.errors.dependencyUnavailable,
  internal_error: t.errors.internal,
})

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
export function errorMessage(t: Dictionary, cause: unknown, fallback: string): string {
  if (cause instanceof AppError) return cause.message
  // Said apart from "no connection": the phone reached the server, the server
  // simply never answered, and a write may still have gone through.
  if (cause instanceof ApiTimeoutError) return t.errors.noAnswer
  if (cause instanceof ApiError) return apiMessages(t)[cause.code] ?? fallback

  const code = codeOf(cause)
  const auth = authMessages(t)
  if (code && auth[code]) return auth[code]

  // Older Supabase releases and network failures arrive without a code. Their
  // message is English, so it is dropped rather than shown.
  return fallback
}

/** No connection at all, which is worth saying differently from a rejection. */
export function isOffline(cause: unknown): boolean {
  return cause instanceof TypeError || (cause instanceof Error && cause.name === 'AbortError')
}

/**
 * A failure as a banner needs it: the sentence, and whether the network was the
 * thing that failed.
 *
 * The two are not the same picture. A crossed-out aerial over "что-то пошло не
 * так на нашей стороне" tells the reader to go and check their wi-fi, which is
 * working; the server is the one that fell over. `offline` is left for the
 * screen to turn into an icon, so this file keeps knowing nothing about the ui.
 */
export function describeFailure(
  t: Dictionary,
  cause: unknown,
  fallback: string,
): { text: string; offline: boolean } {
  return { text: errorMessage(t, cause, fallback), offline: !serverSpoke(cause) }
}

/**
 * Whether the request got as far as an answer.
 *
 * Asked this way round on purpose. `fetch` rejects with whatever the platform
 * feels like — a `TypeError` on some versions, a bare `Error` on others — so a
 * test for "was it a network failure" is a test against a moving target, and a
 * wrong answer puts the aerial over a sentence about the server. Everything
 * this app recognises as the server having spoken is listed here; anything else
 * never left the phone.
 */
function serverSpoke(cause: unknown): boolean {
  return (
    cause instanceof AppError ||
    cause instanceof ApiError ||
    // Reached, and then gave up waiting — which has its own sentence.
    cause instanceof ApiTimeoutError ||
    // Answered, but not with what the contract says. Still an answer.
    cause instanceof ApiContractError ||
    // Supabase rejected it, in words of its own.
    codeOf(cause) !== null
  )
}
