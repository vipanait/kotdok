/**
 * Links that come back into the app after a confirmation or a password reset.
 *
 * The rule is narrow on purpose: only this app's own scheme is accepted, and
 * only the two paths it knows. A link that arrives from anywhere else — an
 * email that was tampered with, a page that deep-links at us — must not send
 * the user somewhere of the sender's choosing, and must not be treated as
 * proof of anything.
 */

export const APP_SCHEME = 'lapka'

export type AuthLink =
  /** Email confirmation or a magic link: Supabase returns a code to exchange. */
  | { kind: 'verify'; code: string }
  /** Password recovery: the app shows the "set a new password" screen. */
  | { kind: 'recover'; code: string }
  /** The provider reported a failure; show it rather than a blank screen. */
  | { kind: 'error'; code: string; description: string | null }

/**
 * @returns the link, or null when it is not ours to act on. Null means ignore,
 *   never "follow it anyway".
 */
export function parseAuthLink(raw: string): AuthLink | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  // Anything but our own scheme is somebody else's link.
  if (url.protocol !== `${APP_SCHEME}:`) return null

  // A scheme URL parses as `lapka://auth/callback`, so the host carries the
  // first segment. Normalise both shapes.
  const path = `${url.host}${url.pathname}`.replace(/\/+$/, '')

  // Supabase puts errors and tokens in the fragment; parameters may be in either.
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const query = url.searchParams
  const read = (key: string) => query.get(key) ?? fragment.get(key)

  const error = read('error') ?? read('error_code')
  if (error) {
    return {
      kind: 'error',
      code: error,
      description: read('error_description'),
    }
  }

  const code = read('code') ?? read('token_hash')
  if (!code) return null

  if (path === 'auth/recover' || read('type') === 'recovery') {
    return { kind: 'recover', code }
  }
  if (path === 'auth/callback' || path === 'auth/confirm') {
    return { kind: 'verify', code }
  }

  return null
}

/**
 * Where the provider should send the user back to. Built here rather than taken
 * from a parameter, so a caller cannot ask us to redirect anywhere else.
 */
export function authRedirectUrl(kind: 'verify' | 'recover'): string {
  return `${APP_SCHEME}://auth/${kind === 'recover' ? 'recover' : 'callback'}`
}
