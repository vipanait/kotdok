import type { FollowupCaseSummary, FollowupSlot } from '@lapka/contracts'
import { followupDueTimes, followupFireMoment, followupScheduleFor } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import type { PlannedReminder } from '@/features/medical-record/reminders/schedule'
import { localDay } from './followup-ui'

/** One open case per pet, at most two questions each; a cap all the same, so the phone's 64 stay mostly for plans. */
export const FOLLOWUP_REMINDER_MAX = 20

type Question = { slot: Exclude<FollowupSlot, 'extra'>; at: Date }

/**
 * Every question still ahead of a case, not only the one it waits for. A
 * watching case asks twice, and both moments are known from its schedule: if
 * the first notification is ignored and the app stays closed, the second one
 * — «не прошло — к врачу» — must still ring on its own.
 */
function questionsAhead(item: FollowupCaseSummary): Question[] {
  // `extra` names an early answer, never a question the case waits for.
  if (item.status !== 'active' || !item.next_slot || item.next_slot === 'extra' || !item.next_due_at) return []
  const pending: Question = { slot: item.next_slot, at: new Date(item.next_due_at) }
  // «Скрыть до завтра» moves the pending question; the ones after it keep their time.
  const hidden = item.hidden_until ? new Date(item.hidden_until) : null
  if (hidden && hidden.getTime() > pending.at.getTime()) pending.at = hidden
  // A case already asking about the vet has no watch questions left.
  if (pending.slot === 'vet') return [pending]
  // The schedule's questions after the pending one, by their place in it —
  // not by time, which «скрыть до завтра» may have moved past them.
  const schedule = followupScheduleFor(item.current_urgency)
  const due = schedule ? followupDueTimes(schedule, new Date(item.anchor_at)) : []
  const index = due.findIndex(({ slot }) => slot === pending.slot)
  const later = index < 0 ? [] : due.slice(index + 1).map(({ slot, dueAt }) => ({ slot: slot as Question['slot'], at: dueAt }))
  return [pending, ...later]
}

/**
 * The phone's notifications for open cases: each question still ahead, at
 * its moment moved out of the night (`followupFireMoment`). Built from the
 * server's list on every sync, so a reinstall or a new phone gets them back
 * at the first open. No symptoms in the text: the lock screen is not private.
 */
export function planFollowupReminders(t: Dictionary, items: readonly FollowupCaseSummary[], now: Date): PlannedReminder[] {
  return items
    .flatMap((item) => questionsAhead(item).map((question) => ({ item, slot: question.slot, fire: followupFireMoment(question.at) })))
    // A question whose moment has passed already rang; the card in the app
    // asks from here, and every app open must not ring it again.
    .filter(({ fire }) => fire.getTime() > now.getTime())
    .sort((a, b) => a.fire.getTime() - b.fire.getTime())
    .slice(0, FOLLOWUP_REMINDER_MAX)
    .map(({ item, slot, fire }) => ({
      id: `lapka-followup-${item.id}-${slot}`,
      petId: item.pet_id,
      day: localDay(fire),
      hour: fire.getHours(),
      minute: fire.getMinutes(),
      title: t.reminders.notificationTitle,
      body: slot === 'vet' ? t.followup.notifyVet(item.pet_name) : t.followup.notifyWatch(item.pet_name),
      data: { kind: 'followup', caseId: item.id },
    }))
}
