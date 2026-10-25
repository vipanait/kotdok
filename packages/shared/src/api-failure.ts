import { ApiError, ApiTimeoutError, isKeyReused } from './api-client'

/**
 * What a failed call means, read once for both apps.
 *
 * The site's record load, weight and event forms and the check form, and the
 * phone's weight form and error banners, each held the same `switch` over
 * `ApiError.code` with a `TypeError` clause for a lost connection. Here it is
 * written once; a screen maps these onto its own words and ways out (a taken
 * day is still the weight form's own reading of `conflict`).
 *
 * `offline` is «no answer»: the browser or the phone never reached the
 * server, or the client gave up waiting. A write may still have landed, so a
 * form keeps everything and sends the same Idempotency-Key again. `keyReused`
 * is the opposite certainty: an earlier try of this very save did land.
 */
export type ApiFailure =
  | 'signedOut'
  | 'deleting'
  | 'gone'
  | 'rejected'
  | 'recordDone'
  | 'rateLimited'
  | 'noCredits'
  | 'reauthRequired'
  | 'keyReused'
  | 'conflict'
  | 'offline'
  | 'failed'

export function apiFailure(error: unknown): ApiFailure {
  if (isKeyReused(error)) return 'keyReused'
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'unauthorized':
        return 'signedOut'
      case 'account_deleting':
        return 'deleting'
      case 'not_found':
        return 'gone'
      case 'bad_request':
        return 'rejected'
      case 'record_done':
        return 'recordDone'
      case 'rate_limited':
        return 'rateLimited'
      case 'insufficient_credits':
        return 'noCredits'
      case 'reauth_required':
        return 'reauthRequired'
      case 'conflict':
        return 'conflict'
      default:
        return 'failed'
    }
  }
  // fetch rejects with a TypeError when there is no network, with an AbortError
  // when the caller gave up; the client's own timeout is ApiTimeoutError.
  if (error instanceof TypeError || error instanceof ApiTimeoutError) return 'offline'
  if (error instanceof Error && error.name === 'AbortError') return 'offline'
  return 'failed'
}
