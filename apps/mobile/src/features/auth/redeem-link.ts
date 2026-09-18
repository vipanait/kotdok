/**
 * Turning what an email link carries into a session — or refusing to.
 *
 * Kept apart from the listener in `app/_layout.tsx` so the rule that matters
 * can be read and tested on its own: a link never replaces a session that is
 * already on this phone.
 */

import type { AuthCredential, EmailOtpType } from '@/lib/auth-links'

/** What redeeming a credential needs from the auth client. */
export interface LinkAuth {
  hasSession: () => Promise<boolean>
  exchangeCodeForSession: (code: string) => Promise<{ error: unknown }>
  verifyOtp: (input: { tokenHash: string; type: EmailOtpType }) => Promise<{ error: unknown }>
}

export type LinkOutcome =
  /** The credential was accepted and there is now a session. */
  | 'signed-in'
  /** Spent, expired, or malformed — the reader gets told the link is no good. */
  | 'invalid'
  /** Somebody is already signed in here, so the link was not acted on. */
  | 'already-signed-in'

export async function redeemAuthLink(
  credential: AuthCredential,
  auth: LinkAuth,
): Promise<LinkOutcome> {
  // The whole point. A link arrives from outside the app — an email, a message,
  // another app opening the scheme — and the session it carries belongs to
  // whoever sent it. Swapping accounts without asking would send the next pet
  // and the next symptom description to that sender.
  if (await auth.hasSession()) return 'already-signed-in'

  try {
    const { error } = credential.via === 'code'
      ? await auth.exchangeCodeForSession(credential.code)
      : await auth.verifyOtp({ tokenHash: credential.tokenHash, type: credential.type })
    return error ? 'invalid' : 'signed-in'
  } catch {
    // Caught, not just checked: a token that is not valid base64 is thrown
    // about rather than returned, and both endings read the same to the person
    // holding the phone.
    return 'invalid'
  }
}
