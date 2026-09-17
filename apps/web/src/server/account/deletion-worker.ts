import 'server-only'

import type { createServiceClient } from '@/server/supabase/server'
import { completeDeletionJob } from '@/server/account/deletion-service'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Carrying out an accepted deletion request (stage 8/05).
 *
 * The request only marks the account and records a job. This takes the job and
 * walks it to the end: the account's rows (one transaction, see
 * `delete_account_data`), then the Auth user, then the job is marked complete.
 * Each finished step is written into the job, so a run that dies halfway is
 * picked up by the next one — the request's own `after()` or the daily cron —
 * without repeating what already happened.
 *
 * A failure is counted, never thrown and never reported as success. After
 * `DELETION_MAX_ATTEMPTS` the job waits for a person, and the receipt says
 * `action_required`.
 *
 * Revoking Apple tokens is deliberately absent: deferred by the owner on
 * 17 September 2026.
 */

export const DELETION_LEASE_SECONDS = 120
export const DELETION_MAX_ATTEMPTS = 5

export type DeletionStep = 'data' | 'auth'
export type DeletionErrorCode = 'data_step_failed' | 'auth_step_failed' | 'complete_step_failed'
export type DeletionRunResult = 'completed' | 'retry' | 'action_required' | 'not_claimed'

export type DeletionWorkerDeps = {
  /** Takes the job; returns its progress, or null when someone else holds it or it is not due. */
  claim(userId: string): Promise<Record<string, unknown> | null>
  deleteAccountData(userId: string): Promise<void>
  /** `absent` when the Auth user is already gone — a finished step, not an error. */
  deleteAuthUser(userId: string): Promise<'deleted' | 'absent'>
  markStep(userId: string, step: DeletionStep): Promise<void>
  complete(userId: string): Promise<void>
  recordFailure(userId: string, code: DeletionErrorCode): Promise<'in_progress' | 'action_required'>
  /** Only the code. The user id and the underlying error stay out of logs. */
  log?(code: DeletionErrorCode): void
}

export async function processDeletionJob(
  deps: DeletionWorkerDeps,
  userId: string,
): Promise<DeletionRunResult> {
  const progress = await deps.claim(userId)
  if (progress === null) return 'not_claimed'

  let code: DeletionErrorCode = 'data_step_failed'
  try {
    if (!('data' in progress)) {
      await deps.deleteAccountData(userId)
      await deps.markStep(userId, 'data')
    }

    code = 'auth_step_failed'
    if (!('auth' in progress)) {
      await deps.deleteAuthUser(userId)
      await deps.markStep(userId, 'auth')
    }

    code = 'complete_step_failed'
    await deps.complete(userId)
    return 'completed'
  } catch {
    deps.log?.(code)
    try {
      const status = await deps.recordFailure(userId, code)
      return status === 'action_required' ? 'action_required' : 'retry'
    } catch {
      // If recording the failure fails, the lease expires and the daily cron
      // picks up the job again. Return 'retry' to let the caller continue.
      return 'retry'
    }
  }
}

/** The worker's dependencies over the real database and Auth admin API. */
export function createDeletionWorkerDeps(supabase: SupabaseService): DeletionWorkerDeps {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(name, args)
    if (error) throw new Error(`${name} failed`)
    return data as T
  }

  return {
    claim: (userId) =>
      rpc<Record<string, unknown> | null>('claim_deletion_job', {
        p_user_id: userId,
        p_lease_seconds: DELETION_LEASE_SECONDS,
      }),
    deleteAccountData: (userId) => rpc<void>('delete_account_data', { p_user_id: userId }),
    async deleteAuthUser(userId) {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      if (!error) return 'deleted'
      if (error.status === 404) return 'absent'
      throw new Error('auth delete failed')
    },
    markStep: (userId, step) => rpc<void>('mark_deletion_step', { p_user_id: userId, p_step: step }),
    async complete(userId) {
      if (!(await completeDeletionJob(supabase, userId))) throw new Error('complete failed')
    },
    recordFailure: (userId, code) =>
      rpc<'in_progress' | 'action_required'>('record_deletion_failure', {
        p_user_id: userId,
        p_error_code: code,
        p_max_attempts: DELETION_MAX_ATTEMPTS,
      }),
    log: (code) => console.error(`[account-deletion] ${code}`),
  }
}
