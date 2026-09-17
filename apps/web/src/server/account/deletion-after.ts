import 'server-only'

import { after } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { createDeletionWorkerDeps, processDeletionJob } from '@/server/account/deletion-worker'

/**
 * Starts the deletion right after the `202` is sent.
 *
 * The person is told the request was accepted before any of the work begins;
 * the work itself usually finishes seconds later. If the platform stops the
 * function first, the job keeps its progress and the daily cron finishes it —
 * the receipt says `pending` meanwhile, never `completed` early.
 */
export function scheduleDeletionProcessing(userId: string): void {
  after(async () => {
    await processDeletionJob(createDeletionWorkerDeps(createServiceClient()), userId)
  })
}
