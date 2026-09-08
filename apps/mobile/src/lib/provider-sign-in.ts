/**
 * Signing in with Google or Yandex ID through the system browser.
 *
 * The browser and the auth client arrive as dependencies rather than imports,
 * so every decision made here — what counts as a cancellation, which address
 * may be exchanged, what the user is told — is testable without a simulator.
 *
 * The app opens the browser itself instead of letting Supabase redirect. That
 * is the only way to learn that the user closed it: a redirect that never comes
 * back is indistinguishable from one that is still loading, and the screen
 * would keep spinning forever.
 */

import { PROVIDER_RETURN_URL, parseProviderReturn } from './auth-links'

export type ProviderId = 'google' | 'custom:yandex'

export type ProviderOutcome =
  /** The session exists. Screens react to the auth state, not to this value. */
  | { kind: 'session' }
  /** The user closed the browser. Not an error, and not shown as one. */
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string }

export type ProviderSignInDeps = {
  /** Asks Supabase for the provider's authorization address without leaving the app. */
  authorize(
    provider: ProviderId,
    redirectUrl: string,
  ): Promise<{ url: string | null; error: { message: string } | null }>
  /** Opens the system browser; resolves when it returns or the user closes it. */
  openBrowser(url: string, redirectUrl: string): Promise<{ type: string; url?: string }>
  /** Turns the authorization code into a session. */
  exchangeCode(code: string): Promise<{ error: { message: string } | null }>
  /**
   * Somewhere to put the provider's own words about a refusal.
   *
   * The user is told something readable; whoever is debugging needs the code
   * the provider actually sent, and on a phone there is nowhere else to read
   * it. Never given the authorization code or a token — only the failure.
   */
  reportRefusal?(code: string, description: string | null): void
}

/**
 * What the user reads. The provider's own wording is not passed through: it is
 * written for developers, arrives in whatever language the provider chose, and
 * occasionally names internals that are none of the user's business.
 */
/**
 * What went wrong, in the reader's language.
 *
 * Passed in rather than kept here: this module has no React and therefore no
 * dictionary of its own, and a sign-in screen that speaks English should not
 * apologise in Russian.
 */
export type ProviderMessages = {
  failedToStart: string
  failedToFinish: string
  refused: string
}

export function createProviderSignIn(deps: ProviderSignInDeps) {
  return async function signInWithProvider(
    provider: ProviderId,
    messages: ProviderMessages,
  ): Promise<ProviderOutcome> {
    const started = await deps.authorize(provider, PROVIDER_RETURN_URL)
    if (started.error || !started.url) return { kind: 'failed', message: messages.failedToStart }

    const returned = await deps.openBrowser(started.url, PROVIDER_RETURN_URL)
    // Anything but an address means the browser closed without an answer.
    if (returned.type !== 'success' || !returned.url) return { kind: 'cancelled' }

    const parsed = parseProviderReturn(returned.url)
    // Null is an address that is not ours: whatever it carries is not a code.
    if (!parsed) return { kind: 'failed', message: messages.failedToFinish }
    if (parsed.kind === 'error') {
      deps.reportRefusal?.(parsed.code, parsed.description)
      return { kind: 'failed', message: messages.refused }
    }

    const exchanged = await deps.exchangeCode(parsed.code)
    if (exchanged.error) return { kind: 'failed', message: messages.failedToFinish }

    return { kind: 'session' }
  }
}
