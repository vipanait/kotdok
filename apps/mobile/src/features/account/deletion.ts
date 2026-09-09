import { ApiError } from '@lapka/shared'
import type { ApiClient } from '@lapka/shared'

/**
 * Asking for the account to be deleted, from the phone (stage 9/01 and 9/03).
 *
 * Kept apart from the screen so the order of operations can be tested without
 * one. The order is the whole of the difficulty here, and getting it wrong is
 * not a cosmetic bug: clear the session a moment too early and the request
 * cannot be sent; keep the receipt a moment too late and the person is left
 * with no way to ask what happened.
 */

/**
 * Fills the array it is given. Narrower than the platform's `getRandomValues`,
 * which is generic over every view type and drags that generic through
 * everything it touches — this only ever needs bytes.
 */
export type FillRandom = (bytes: Uint8Array) => void

/** 32 bytes of randomness, hex, as `DeletionReceiptSecretSchema` requires. */
export function newReceiptSecret(random: FillRandom): string {
  const bytes = new Uint8Array(32)
  random(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export type DeletionOutcome =
  /** Accepted. The receipt is stored; the work has not finished. */
  | { kind: 'accepted'; receipt: string }
  /** The person must authenticate again before this can be asked for. */
  | { kind: 'reauth_required' }
  | { kind: 'failed'; message: string }

export type DeletionDeps = {
  api: ApiClient
  /** Writes the receipt somewhere that survives signing out. */
  keepReceipt: (secret: string) => Promise<void>
  /** Ends the session and clears everything belonging to it. */
  forgetAccount: () => Promise<void>
  random: FillRandom
  /** What to say when the server refuses for a reason we do not translate. */
  fallbackMessage: string
}

/**
 * The sequence, in the only order that leaves nothing dangling.
 *
 * 1. Ask for a proof of fresh authentication. If the person signed in a week
 *    ago this fails, and failing here costs nothing — no receipt has been made
 *    and no account has been touched.
 * 2. Make the receipt and **write it down before sending**. A `202` that never
 *    arrives is the case the receipt exists for; a receipt created after the
 *    answer would be missing in exactly that case.
 * 3. Send the request.
 * 4. Only then clear the session, the cache and the drafts. Doing this earlier
 *    would leave nothing to send the request with.
 */
export async function deleteAccount(deps: DeletionDeps): Promise<DeletionOutcome> {
  let proof: string
  try {
    proof = (await deps.api.requestReauth({ operation: 'account_deletion' })).token
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'reauth_required') {
      return { kind: 'reauth_required' }
    }
    return { kind: 'failed', message: deps.fallbackMessage }
  }

  const receipt = newReceiptSecret(deps.random)
  await deps.keepReceipt(receipt)

  try {
    await deps.api.requestAccountDeletion({ receipt_secret: receipt, reauth_token: proof })
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'reauth_required') {
      return { kind: 'reauth_required' }
    }
    return { kind: 'failed', message: deps.fallbackMessage }
  }

  // The account is going, so nothing belonging to it stays on the phone. The
  // receipt is not part of that: it belongs to the person, not the account, and
  // it is the only thing left that can answer "did it finish?".
  await deps.forgetAccount()

  return { kind: 'accepted', receipt }
}
