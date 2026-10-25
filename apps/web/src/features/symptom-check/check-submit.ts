import type { CheckCreateInput, CheckJobStatus, ErrorCode } from '@lapka/contracts'
import { ApiError, apiFailure } from '@lapka/shared'

/**
 * The site's check goes the way the phone's does (POST /checks, then the
 * job): what the form sends, how the answer is waited for, and what a
 * failure means for the form. Apart from React so it is tested.
 */

export type CheckFields = {
  petId: string
  symptoms: string
  appetite: string
  activity: string
  duration: string
  stool: string
  painSigns: string[]
}

/** The body of POST /checks: an empty choice is none, the re-check names its case. */
export function checkCreateBody(fields: CheckFields, linkedCaseId: string | null): CheckCreateInput {
  const choice = <T extends string>(value: string) => (value ? (value as T) : null)
  return {
    pet_id: fields.petId || null,
    symptoms: fields.symptoms,
    upload_ids: [],
    appetite: choice<CheckCreateInput['appetite'] & string>(fields.appetite),
    activity: choice<CheckCreateInput['activity'] & string>(fields.activity),
    duration: choice<CheckCreateInput['duration'] & string>(fields.duration),
    stool: choice<CheckCreateInput['stool'] & string>(fields.stool),
    pain_signs: fields.painSigns as CheckCreateInput['pain_signs'],
    ...(linkedCaseId ? { followup_case_id: linkedCaseId } : {}),
  }
}

/** The analysis ran and failed, with the server's reason; or the wait ran out. */
export class CheckJobFailed extends Error {
  constructor(readonly code: ErrorCode | 'timeout') {
    super(`The check was not completed: ${code}`)
    this.name = 'CheckJobFailed'
  }
}

export const POLL_EVERY_MS = 1500
/** As on the phone: the analysis takes seconds, the function may run three minutes. */
export const GIVE_UP_AFTER_MS = 3 * 60 * 1000

/**
 * Polls the job until the check exists and answers its id. A failed job
 * throws with its reason; a job still running past the deadline, with
 * `timeout` — the key is kept then, since the check may well exist.
 */
export async function waitForCheck(
  jobId: string,
  deps: {
    getJob: (jobId: string) => Promise<CheckJobStatus>
    sleep: (ms: number) => Promise<void>
    pollMs?: number
    giveUpMs?: number
    now?: () => number
  },
): Promise<string> {
  const now = deps.now ?? Date.now
  const deadline = now() + (deps.giveUpMs ?? GIVE_UP_AFTER_MS)
  while (now() < deadline) {
    const job = await deps.getJob(jobId)
    if (job.status === 'completed' && job.check_id) return job.check_id
    if (job.status === 'failed') throw new CheckJobFailed(job.error_code ?? 'internal_error')
    await deps.sleep(deps.pollMs ?? POLL_EVERY_MS)
  }
  throw new CheckJobFailed('timeout')
}

export type SubmitFailure =
  /** The session is over: sign in and come back. */
  | 'signedOut'
  /** The balance is empty; the form says so in place of the button. */
  | 'noCredits'
  /** The server refused the fields. */
  | 'invalid'
  /** The pet is gone. */
  | 'petMissing'
  /** The case cannot take a re-check any more; nothing was charged. */
  | 'recheckRefused'
  | 'busy'
  /** No answer at all: offline, or the request timed out. */
  | 'offline'
  | 'failed'

/** What a failed send means for the form. */
export function submitFailure(error: unknown, linkedCase: boolean): SubmitFailure {
  if (error instanceof CheckJobFailed) return error.code === 'insufficient_credits' ? 'noCredits' : 'failed'
  const failure = apiFailure(error)
  switch (failure) {
    case 'rejected':
      return 'invalid'
    case 'gone':
      return 'petMissing'
    case 'rateLimited':
      return 'busy'
    // A 409 on a check is the case refusing another re-check; alone it means nothing.
    case 'keyReused':
    case 'conflict':
      return linkedCase ? 'recheckRefused' : 'failed'
    case 'signedOut':
    case 'noCredits':
    case 'offline':
      return failure
    default:
      return 'failed'
  }
}

/**
 * Whether the Idempotency-Key is spent. A server that answered with its own
 * envelope, or a job that failed, has settled that key — sending it again
 * would only bring the same refusal back. No answer settles nothing: the
 * check may exist, and only the same key lets a repeat find it.
 */
export function keySpent(error: unknown): boolean {
  if (error instanceof CheckJobFailed) return error.code !== 'timeout'
  return error instanceof ApiError && error.requestId !== null
}
