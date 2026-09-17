import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import type { createServiceClient } from '@/server/supabase/server'
import {
  createDeletionWorkerDeps,
  processDeletionJob,
  type DeletionRunResult,
} from '@/server/account/deletion-worker'

type SupabaseService = ReturnType<typeof createServiceClient>

/** How many jobs one daily run takes on. The rest wait for tomorrow. */
export const DELETION_CRON_BATCH = 20

/**
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` to scheduled routes.
 * Without a configured secret nothing is authorized: an unset variable must
 * not turn the route into a public "delete everything waiting" button.
 */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8')
  const actual = Buffer.from(header, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * The daily safety net for stage 8/05: finishes jobs the request's own run did
 * not, and removes finished job records whose retention has run out.
 */
export async function runDeletionCron(
  supabase: SupabaseService,
  processJob: (userId: string) => Promise<DeletionRunResult> = (userId) =>
    processDeletionJob(createDeletionWorkerDeps(supabase), userId),
) {
  const { data: purged, error: purgeError } = await supabase.rpc('purge_expired_deletion_jobs')
  if (purgeError) throw new Error('purge_expired_deletion_jobs failed')

  const { data: due, error } = await supabase.rpc('due_deletion_jobs', { p_limit: DELETION_CRON_BATCH })
  if (error) throw new Error('due_deletion_jobs failed')

  const summary = { processed: 0, completed: 0, retried: 0, actionRequired: 0, purged: Number(purged ?? 0) }
  for (const userId of (due ?? []) as string[]) {
    // One job's own bug must never abort the batch: every other due job still
    // deserves its turn, and today's failure is tomorrow's retry.
    let result: DeletionRunResult
    try {
      result = await processJob(userId)
    } catch {
      result = 'retry'
    }
    summary.processed++
    if (result === 'completed') summary.completed++
    if (result === 'retry') summary.retried++
    if (result === 'action_required') summary.actionRequired++
  }

  return summary
}
