import type { CheckJobStatus } from '@lapka/contracts'
import type { AppError } from '@/lib/errors'

/**
 * Waiting for the analysis, one answer at a time.
 *
 * Apart from the screen so the reading of each answer can be tested; the loop
 * that asks, and what it does with the screen, is `useCheckSubmission`.
 */

/** How often to ask, and for how long before saying so. */
export const POLL_EVERY_MS = 1500
export const GIVE_UP_AFTER_MS = 3 * 60 * 1000

export type JobStep =
  | { kind: 'ready'; checkId: string }
  | { kind: 'failed'; reason: 'insufficient_credits' | 'analysis_failed' }
  | { kind: 'running' }

/**
 * What one answer about the job means. Done is ready only with the stored
 * check's id; a failure says whether the balance was the reason, which is the
 * one failure with its own way out.
 */
export function jobStep(job: Pick<CheckJobStatus, 'status' | 'check_id' | 'error_code'>): JobStep {
  if (job.status === 'completed' && job.check_id) return { kind: 'ready', checkId: job.check_id }
  if (job.status === 'failed') {
    return { kind: 'failed', reason: job.error_code === 'insufficient_credits' ? 'insufficient_credits' : 'analysis_failed' }
  }
  return { kind: 'running' }
}

/**
 * The one way out a failed check offers: an empty balance needs a request, a
 * slow answer will arrive in the history on its own, and anything else is
 * worth trying again.
 */
export function recoveryFor(kind: AppError['kind'] | null): 'request' | 'history' | 'retry' {
  if (kind === 'insufficient_credits') return 'request'
  if (kind === 'still_running') return 'history'
  return 'retry'
}
