export type ExtraCheckRequestStatus = 'pending' | 'approved' | 'rejected' | null

/**
 * What the balance means for the next step.
 *
 * - `ready` — there is at least one check; a symptom check can start.
 * - `pending` — no checks, a request for an extra one is waiting: no re-request.
 * - `rejected` — no checks, the last request was turned down: asking again is allowed.
 * - `out` — no checks, never asked or the approved check is already spent.
 */
export type CreditsState = 'ready' | 'pending' | 'rejected' | 'out'

export function creditsState(credits: number, latestRequestStatus: ExtraCheckRequestStatus): CreditsState {
  if (credits > 0) return 'ready'
  if (latestRequestStatus === 'pending') return 'pending'
  if (latestRequestStatus === 'rejected') return 'rejected'
  return 'out'
}

/** The server takes a request only with an empty balance and nothing pending. */
export function canRequestExtraCheck(credits: number, latestRequestStatus: ExtraCheckRequestStatus): boolean {
  return credits <= 0 && latestRequestStatus !== 'pending'
}
