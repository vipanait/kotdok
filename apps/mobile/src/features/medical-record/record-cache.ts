import { useCallback } from 'react'
import type { HealthOverview } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { useCacheReader, useInvalidate } from '@/lib/query-cache'
import { queryKeys, recordKeys } from '@/lib/query-keys'
import { useReminders } from './reminders/ReminderProvider'

/**
 * After anything that moves a pet's record on the server — a plan saved, a
 * course ended, a dose marked, the pet form changed: every screen showing
 * the record, its doses, its summary or the pet lists reads again, and the
 * phone's reminders are rebuilt from the server's plans. Without a pet (one
 * added or removed), every record.
 */
export function useRecordChanged() {
  const invalidate = useInvalidate()
  const reminders = useReminders()
  return useCallback(
    (petId: string | null): Promise<void> => {
      const done = invalidate(recordKeys(petId))
      reminders.refresh()
      // Settled when the screens on view have read again.
      return done
    },
    [invalidate, reminders],
  )
}

/**
 * A pet's record for a form to build its draft from: what a screen of this
 * pet loaded within the last half minute, the server otherwise.
 */
export function useOverviewReader() {
  const read = useCacheReader()
  return useCallback(
    (petId: string): Promise<HealthOverview> =>
      read(queryKeys.overview(petId), () => withFreshSession((api) => api.getHealthOverview(petId, localToday()))),
    [read],
  )
}
