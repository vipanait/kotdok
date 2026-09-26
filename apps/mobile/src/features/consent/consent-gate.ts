import type { ConsentSource } from '@lapka/contracts'

/** The platform a consent from this app was given on; the app runs on no other. */
export function consentSource(os: string): ConsentSource {
  return os === 'android' ? 'android' : 'ios'
}

/**
 * On the way into the app: first hand over the consent ticked on the
 * registration screen (a provider sign-in cannot carry it), then ask whether
 * any is still owed.
 *
 * A failed hand-over is not an error the person sees — the status then says
 * `required` and the consent screen asks again. An unreadable status lets them
 * in: the server still refuses with `consent_required`, and that brings the
 * consent screen up instead.
 */
export async function settleConsent(deps: {
  pending: boolean
  give(): Promise<void>
  status(): Promise<{ required: boolean }>
}): Promise<'open' | 'consent'> {
  if (deps.pending) await deps.give().catch(() => {})
  try {
    return (await deps.status()).required ? 'consent' : 'open'
  } catch {
    return 'open'
  }
}

/**
 * Runs `go` once, then ignores further calls until `reset`. Several requests
 * refused with `consent_required` together would otherwise each open the
 * consent screen again, remounting it and clearing a box already ticked.
 */
export function onceUntilReset(go: () => void): { fire(): void; reset(): void } {
  let fired = false
  return {
    fire() {
      if (fired) return
      fired = true
      go()
    },
    reset() {
      fired = false
    },
  }
}

/**
 * Whether code outside the tabs may call the API for this user: only once the
 * tabs have settled their consent. Before that a call can reach the server
 * ahead of the consent handed over from registration and be refused.
 */
export function consentSettled(userId: string | null, settledFor: string | null): boolean {
  return userId !== null && settledFor === userId
}
