/**
 * The analysis that is still running, remembered outside the screen.
 *
 * Leaving the check tab unmounts the form, and with it the loop that was
 * asking whether the answer had arrived. The person was told they could go, so
 * what they were waiting for cannot live in that component: the job id is kept
 * here, and the screen picks the waiting back up when it comes into view.
 *
 * Deliberately module state rather than storage. It has to survive a screen,
 * not a restart — a check that was paid for is in the history either way, and
 * a job id written to disk would outlive the account that owns it.
 */

type Pending = { userId: string; jobId: string }
type Ready = { userId: string; checkId: string }

let pending: Pending | null = null
let ready: Ready | null = null

/** Sent, charged, and now being waited for. */
export function rememberPendingCheck(userId: string, jobId: string): void {
  pending = { userId, jobId }
  ready = null
}

/** @returns the job still running for this account, if there is one. */
export function pendingCheck(userId: string | null): string | null {
  return pending && userId !== null && pending.userId === userId ? pending.jobId : null
}

/**
 * The answer arrived while nobody was looking at the waiting screen.
 *
 * Kept until the check tab is next opened, which is where it was promised.
 */
export function rememberFinishedCheck(userId: string, checkId: string): void {
  pending = null
  ready = { userId, checkId }
}

/** @returns the result to open on the way in, and forgets it. */
export function takeFinishedCheck(userId: string | null): string | null {
  if (!ready || userId === null || ready.userId !== userId) return null
  const { checkId } = ready
  ready = null
  return checkId
}

/**
 * Nothing is being waited for any more: the job failed, the wait was given up
 * on, or another account signed in on this phone.
 */
export function forgetPendingCheck(): void {
  pending = null
  ready = null
}
