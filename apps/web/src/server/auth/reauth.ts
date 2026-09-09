import 'server-only'

import { randomBytes, createHash } from 'node:crypto'
import type { ReauthOperation } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Proving that the person is still at the keyboard.
 *
 * Stage 5/08 asks for a server-side proof of a fresh authentication, bound to
 * one user and one operation, short-lived and spent once — and states that a
 * token refresh and a client-side "confirmed" flag do not count. Stage 8/03
 * then requires that proof before an account may be marked for deletion.
 *
 * Freshness comes from the access token's `amr` claim, which records when each
 * authentication method was actually used. It survives a refresh unchanged:
 * measured against staging, signing in produced `amr[0].timestamp` equal to
 * `iat`, and a refresh three seconds later moved `iat` while leaving `amr`
 * alone. That is what makes it usable — a claim the client could freshen by
 * refreshing would prove nothing. It also works the same whichever way a person
 * signed in, because every method writes its own entry.
 */

/** How recently the person must have authenticated for a proof to be minted. */
export const FRESH_AUTH_WINDOW_SECONDS = 5 * 60

/** How long the proof itself lasts. Long enough to confirm, short enough to matter. */
export const PROOF_LIFETIME_SECONDS = 5 * 60

/**
 * When the caller last actually authenticated, from a token that has *already
 * been verified*.
 *
 * This decodes without checking the signature, which is safe only because of
 * where it is called: `authenticateBearer` has already handed the token to
 * Supabase and been told it is genuine. Reading a claim out of a token somebody
 * else has verified is not the same as trusting an unverified token, and this
 * function must never be used on one.
 *
 * @returns seconds since the epoch, or null when the token carries no `amr` —
 *   in which case there is nothing to be fresh about and the caller refuses.
 */
export function authenticatedAt(verifiedToken: string): number | null {
  const payload = verifiedToken.split('.')[1]
  if (!payload) return null

  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (typeof claims !== 'object' || claims === null) return null
  const amr = (claims as { amr?: unknown }).amr
  if (!Array.isArray(amr)) return null

  // The newest entry wins. A session can carry several — signing in with a
  // password and later adding a factor — and what matters is the most recent
  // time the person proved anything, not the first.
  const times = amr
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as { timestamp?: unknown }).timestamp : null))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  return times.length > 0 ? Math.max(...times) : null
}

/** Whether that authentication is recent enough to act on. */
export function isFresh(authTime: number | null, now: Date = new Date()): boolean {
  if (authTime === null) return false
  const age = Math.floor(now.getTime() / 1000) - authTime
  // A future timestamp is not freshness, it is a clock that cannot be trusted.
  return age >= 0 && age <= FRESH_AUTH_WINDOW_SECONDS
}

/** The stored form. The token itself is never written down. */
export function hashProof(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export type IssuedProof = { token: string; expiresAt: Date }

/**
 * Mints one proof. The caller has already established that the authentication
 * is fresh; this only records the consequence.
 */
export async function issueReauthProof(
  supabase: SupabaseService,
  userId: string,
  operation: ReauthOperation,
  now: Date = new Date(),
): Promise<IssuedProof | null> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + PROOF_LIFETIME_SECONDS * 1000)

  const { error } = await supabase.from('reauth_proofs').insert({
    user_id: userId,
    operation,
    token_hash: hashProof(token),
    expires_at: expiresAt.toISOString(),
  })

  if (error) return null
  return { token, expiresAt }
}

/**
 * Spends a proof, and says whether it was one.
 *
 * The decision belongs to the database, in a single statement, so two requests
 * arriving together cannot both be told yes. Expiry, the wrong owner, the wrong
 * operation and a second use are all the same answer here — false — because
 * telling them apart would only help somebody guessing.
 */
export async function consumeReauthProof(
  supabase: SupabaseService,
  userId: string,
  operation: ReauthOperation,
  token: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('consume_reauth_proof', {
    p_user_id: userId,
    p_operation: operation,
    p_token_hash: hashProof(token),
  })

  return !error && data === true
}
