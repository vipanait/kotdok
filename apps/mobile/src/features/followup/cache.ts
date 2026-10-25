import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/AuthProvider'
import { useReminders } from '@/features/medical-record/reminders/ReminderProvider'

/**
 * After anything that moves a case: every screen showing it reads again, and
 * the phone's notifications are rebuilt from the server's list.
 */
export function useFollowupChanged() {
  const client = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const reminders = useReminders()
  return useCallback(() => {
    for (const key of ['followups', 'followup', 'check-followup', 'episodes', 'checks']) {
      void client.invalidateQueries({ queryKey: [userId, key] })
    }
    reminders.refresh()
  }, [client, userId, reminders])
}
