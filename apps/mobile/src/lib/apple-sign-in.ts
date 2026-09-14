/**
 * Signing in with Apple through the system sheet on iOS.
 *
 * Unlike Google and Yandex there is no browser and no code to exchange: Apple
 * hands the app an identity token, and Supabase checks it — Apple's signature,
 * the audience, the nonce, the expiry — before it issues a session. Nothing
 * here checks the token again. A check made on the client proves nothing to a
 * server that has to assume the client is lying.
 *
 * The sheet and the client arrive as dependencies, as in `provider-sign-in.ts`,
 * so every decision below is testable without a phone.
 *
 * Android and the site reach Apple through the browser flow instead; there is
 * no system sheet there.
 */

import type { ProviderMessages, ProviderOutcome } from './provider-sign-in'

/** The code the sheet rejects with when the person closes it. */
const CANCELLED = 'ERR_REQUEST_CANCELED'

export type AppleSignInDeps = {
  /** A fresh, unguessable value for this one attempt. */
  randomNonce(): string
  /** Lowercase hex SHA-256: the form Supabase compares with the token's `nonce`. */
  sha256(value: string): Promise<string>
  /**
   * Opens Apple's sheet with the hashed nonce. Resolves with the token, or
   * rejects with the native error, whose `code` tells a closed sheet apart.
   */
  requestCredential(hashedNonce: string): Promise<{ identityToken: string | null }>
  /** Hands the token and the raw nonce to Supabase, which hashes and compares. */
  signInWithIdToken(token: string, nonce: string): Promise<{ error: { message: string } | null }>
  /**
   * Somewhere for whoever is debugging to read what failed. Never given the
   * token or the nonce — only the stage and the error's own words.
   */
  reportFailure?(stage: 'apple' | 'supabase', detail: string): void
}

/** The system sheet exists only on Apple's own platforms; this app ships to iOS. */
export function usesNativeAppleSignIn(os: string): boolean {
  return os === 'ios'
}

export function createAppleSignIn(deps: AppleSignInDeps) {
  return async function signInWithApple(messages: ProviderMessages): Promise<ProviderOutcome> {
    // Apple writes the hash into the token; Supabase gets the raw value and
    // hashes it itself. A token replayed from another attempt carries a hash of
    // a nonce this attempt never made, and is refused.
    const nonce = deps.randomNonce()
    const hashedNonce = await deps.sha256(nonce)

    let identityToken: string | null
    try {
      ;({ identityToken } = await deps.requestCredential(hashedNonce))
    } catch (cause) {
      const code = errorCode(cause)
      // Closing the sheet is a choice, not a failure: nothing reaches Supabase,
      // so no account is created by a person who changed their mind.
      if (code === CANCELLED) return { kind: 'cancelled' }
      deps.reportFailure?.('apple', code ?? 'unknown')
      return { kind: 'failed', message: messages.failedToStart }
    }

    if (!identityToken) {
      deps.reportFailure?.('apple', 'no identity token')
      return { kind: 'failed', message: messages.failedToFinish }
    }

    const { error } = await deps.signInWithIdToken(identityToken, nonce)
    if (error) {
      deps.reportFailure?.('supabase', error.message)
      return { kind: 'failed', message: messages.failedToFinish }
    }

    return { kind: 'session' }
  }
}

function errorCode(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return null
  return typeof cause.code === 'string' ? cause.code : null
}
