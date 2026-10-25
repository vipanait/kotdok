import type { FollowupCaseSummary } from '@lapka/contracts'
import { followupFireMoment } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import type { PlannedReminder } from '@/features/medical-record/reminders/schedule'
import { localDay } from './followup-ui'

/** One per pet already (one open case each); a cap all the same, so the phone's 64 stay mostly for plans. */
export const FOLLOWUP_REMINDER_MAX = 10

/**
 * The phone's notifications for open cases: the next question of each, at its
 * moment moved out of the night (`followupFireMoment`), or after «скрыть до
 * завтра». Built from the server's list on every sync, so a reinstall or a new
 * phone gets them back at the first open. No symptoms in the text: the lock
 * screen is not private.
 */
export function planFollowupReminders(t: Dictionary, items: readonly FollowupCaseSummary[], now: Date): PlannedReminder[] {
  return items
    .filter((item) => item.status === 'active' && item.next_due_at)
    .map((item) => {
      const due = new Date(item.next_due_at!)
      const hidden = item.hidden_until ? new Date(item.hidden_until) : null
      const from = hidden && hidden.getTime() > due.getTime() ? hidden : due
      return { item, fire: followupFireMoment(from) }
    })
    // A question whose moment has passed already rang; the card in the app
    // asks from here, and every app open must not ring it again.
    .filter(({ fire }) => fire.getTime() > now.getTime())
    .sort((a, b) => a.fire.getTime() - b.fire.getTime())
    .slice(0, FOLLOWUP_REMINDER_MAX)
    .map(({ item, fire }) => ({
      id: `lapka-followup-${item.id}-${item.next_slot}`,
      petId: item.pet_id,
      day: localDay(fire),
      hour: fire.getHours(),
      minute: fire.getMinutes(),
      title: t.reminders.notificationTitle,
      body: item.next_slot === 'vet' ? t.followup.notifyVet(item.pet_name) : t.followup.notifyWatch(item.pet_name),
      data: { kind: 'followup', caseId: item.id },
    }))
}
