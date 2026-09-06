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

/**
 * What the link carries to prove the user opened it.
 *
 * Which one arrives is the project's decision, not the app's. With the PKCE
 * flow Supabase sends a code to exchange; with the implicit flow it puts the
 * session straight in the fragment. Links issued server-side, by an admin tool
 * rather than by the app, are always the second kind. Reading whichever came
 * beats assuming, which is how password recovery came to be broken: the client
 * was on the implicit flow while this file expected a code.
 */
export type AuthCredential =
  | { via: 'code'; code: string }
  | { via: 'tokens'; accessToken: string; refreshToken: string }

export type AuthLink =
  /** Email confirmation or a magic link. */
  | { kind: 'verify'; credential: AuthCredential }
  /** Password recovery: the app shows the "set a new password" screen. */
  | { kind: 'recover'; credential: AuthCredential }
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

  const credential = readCredential(read)
  if (!credential) return null

  if (path === 'auth/recover' || read('type') === 'recovery') {
    return { kind: 'recover', credential }
  }
  if (path === 'auth/callback' || path === 'auth/confirm') {
    return { kind: 'verify', credential }
  }

  return null
}

/** A code to exchange, or a session handed over whole — whichever the link has. */
function readCredential(read: (key: string) => string | null): AuthCredential | null {
  const code = read('code') ?? read('token_hash')
  if (code) return { via: 'code', code }

  const accessToken = read('access_token')
  const refreshToken = read('refresh_token')
  // Half a session is no session: without both tokens there is nothing to set.
  if (accessToken && refreshToken) return { via: 'tokens', accessToken, refreshToken }

  return null
}

/**
 * Where the provider should send the user back to. Built here rather than taken
 * from a parameter, so a caller cannot ask us to redirect anywhere else.
 */
export function authRedirectUrl(kind: 'verify' | 'recover'): string {
  return `${APP_SCHEME}://auth/${kind === 'recover' ? 'recover' : 'callback'}`
}
