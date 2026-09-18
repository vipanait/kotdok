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
 * Where a provider sends the user back after the system browser.
 *
 * Deliberately not the path the emails use. On Android the browser hands the
 * link to the system as well, so a shared path would let the listener in
 * `app/_layout.tsx` exchange the same authorization code a second time — the
 * first exchange has already spent it, and the user would be shown a failure
 * right after a successful sign-in. `parseAuthLink` does not know this path and
 * therefore ignores it, which is the whole mechanism: no flags, no timers.
 */
export const PROVIDER_RETURN_PATH = 'auth/provider'
export const PROVIDER_RETURN_URL = `${APP_SCHEME}://${PROVIDER_RETURN_PATH}`

/** What came back from the provider: something to exchange, or a refusal. */
export type ProviderReturn =
  | { kind: 'code'; code: string }
  | { kind: 'error'; code: string; description: string | null }

/**
 * @returns what the provider sent back, or null when the address is not ours.
 *   Null means the caller has nothing to exchange — never "try it anyway".
 */
export function parseProviderReturn(raw: string): ProviderReturn | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.protocol !== `${APP_SCHEME}:`) return null
  if (`${url.host}${url.pathname}`.replace(/\/+$/, '') !== PROVIDER_RETURN_PATH) return null

  // Supabase puts the code in the query; a provider's error may land in either.
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const read = (key: string) => url.searchParams.get(key) ?? fragment.get(key)

  const error = read('error') ?? read('error_code')
  if (error) return { kind: 'error', code: error, description: read('error_description') }

  const code = read('code')
  return code ? { kind: 'code', code } : null
}

/**
 * What the link carries to prove the user opened it.
 *
 * Both kinds still have to be checked before they are worth anything: a PKCE
 * code is useless without the verifier this device kept, and a one-time token
 * is verified against the server. What is deliberately not accepted is a
 * finished session — an `access_token` and `refresh_token` sitting in the
 * fragment. Anyone can put a working session in a link and send it, and the
 * account it opens is theirs, so acting on one hands the person's next symptom
 * description to the sender.
 */
export type AuthCredential =
  | { via: 'code'; code: string }
  | { via: 'otp'; tokenHash: string; type: EmailOtpType }

/** What an emailed one-time token was issued for; Supabase needs it back. */
const OTP_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const

export type EmailOtpType = (typeof OTP_TYPES)[number]

function readOtpType(raw: string | null): EmailOtpType | null {
  return OTP_TYPES.find(type => type === raw) ?? null
}

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

/** A code to exchange, or a one-time token to verify. Nothing else counts. */
function readCredential(read: (key: string) => string | null): AuthCredential | null {
  const code = read('code')
  if (code) return { via: 'code', code }

  const tokenHash = read('token_hash')
  if (tokenHash) {
    // Without knowing what it was issued for there is nothing to verify it as,
    // and guessing would turn a recovery token into a sign-in.
    const type = readOtpType(read('type'))
    return type ? { via: 'otp', tokenHash, type } : null
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
