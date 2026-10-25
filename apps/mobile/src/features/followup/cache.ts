import { useCallback } from 'react'
import { useInvalidate } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useReminders } from '@/features/medical-record/reminders/ReminderProvider'

/**
 * After anything that moves a case: every screen showing it reads again, and
 * the phone's notifications are rebuilt from the server's list.
 */
export function useFollowupChanged() {
  const invalidate = useInvalidate()
  const reminders = useReminders()
  return useCallback(() => {
    void invalidate([queryKeys.followups(), ['followup'], ['check-followup'], ['episodes'], queryKeys.allChecks()])
    reminders.refresh()
  }, [invalidate, reminders])
}
