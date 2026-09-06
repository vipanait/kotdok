/**
 * One refresh, however many requests hit a 401 at once.
 *
 * A screen that loads pets, the profile and history together will get three
 * 401s within milliseconds of an expired token. Refreshing per request would
 * spend three refresh tokens, and with rotation enabled the later two are
 * already invalid — the app would sign the user out for no reason. So the first
 * caller performs the refresh and the rest wait for its result.
 */

export type RefreshOutcome =
  | { ok: true; accessToken: string }
  /** The session is gone for good; the caller signs out. */
  | { ok: false }

export type RefreshCoordinatorOptions = {
  /** Asks the auth provider for a new session. */
  refresh: () => Promise<RefreshOutcome>
  /** Called once when a refresh fails, so the app can sign out and clean up. */
  onSessionLost: () => void | Promise<void>
}

export type RefreshCoordinator = {
  /** Resolves with a fresh token, or null when the session is over. */
  refreshOnce(): Promise<string | null>
  /** How many times the underlying refresh actually ran. For tests. */
  readonly refreshCount: number
}

export function createRefreshCoordinator(
  options: RefreshCoordinatorOptions,
): RefreshCoordinator {
  let inFlight: Promise<string | null> | null = null
  let count = 0

  async function run(): Promise<string | null> {
    count += 1
    let outcome: RefreshOutcome

    try {
      outcome = await options.refresh()
    } catch {
      outcome = { ok: false }
    }

    if (!outcome.ok) {
      await options.onSessionLost()
      return null
    }

    return outcome.accessToken
  }

  return {
    refreshOnce() {
      // A later caller joins the refresh already running rather than starting
      // its own; the promise is cleared afterwards so the next expiry refreshes
      // again.
      inFlight ??= run().finally(() => {
        inFlight = null
      })

      return inFlight
    },

    get refreshCount() {
      return count
    },
  }
}
