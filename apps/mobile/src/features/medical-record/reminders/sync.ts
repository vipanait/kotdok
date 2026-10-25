import { UuidSchema, type DueItem, type FollowupCaseSummary, type MedicationDose } from '@lapka/contracts'
import { planFollowupReminders } from '@/features/followup/followup-reminders'
import type { Dictionary } from '@/i18n'
import { REMINDER_LIMIT, planReminders, reminderMoment, type PlannedReminder, type ReminderSettings } from './schedule'
import { planDoseReminders, planDoseRenewal, type DoseCourse } from './doses'

/** The slice of expo-notifications this needs, so tests need no native module. */
export type Notifier = {
  granted(): Promise<boolean>
  cancelAll(): Promise<void>
  /** Takes delivered notifications off the lock screen and the list. */
  dismissAll(): Promise<void>
  schedule(reminder: PlannedReminder, data: { petId: string; userId: string; kind?: string; caseId?: string }): Promise<void>
}

export type ReminderAccount = {
  userId: string
  load(): Promise<{
    due: DueItem[]
    pets: { id: string; name: string }[]
    /** Courses with times, and the doses given in the week ahead (FB-5); none from an older caller. */
    courses?: DoseCourse[]
    doses?: MedicationDose[]
    /** Open follow-up cases after a check; none from an older caller. */
    followups?: FollowupCaseSummary[]
  }>
}

/**
 * Replaces the phone's reminders with what the signed-in owner's open plans
 * call for. Runs one at a time, and `clear` (sign-out) wins over a run still
 * loading: nothing of the previous account is scheduled after it (MR-08.3).
 * Every notification carries its owner, so a tap after an account change is
 * not followed into someone else's pet.
 */
export function createReminderSync(deps: {
  notifier: Notifier
  settings(): Promise<ReminderSettings>
  t(): Dictionary
  now?: () => Date
}) {
  let generation = 0
  let queue: Promise<void> = Promise.resolve()
  // Refreshes asked for while a run is going fold into one next run, for the latest account.
  let waiting: { promise: Promise<void>; account: ReminderAccount | null } | null = null

  const serial = (work: () => Promise<void>) => {
    queue = queue.then(work, work)
    return queue
  }

  async function sync(account: ReminderAccount, mine: number) {
    const [granted, settings] = await Promise.all([deps.notifier.granted(), deps.settings()])
    if (!granted || !settings.enabled) {
      if (mine === generation) await deps.notifier.cancelAll()
      return
    }
    const { due, pets, courses = [], doses = [], followups = [] } = await account.load()
    if (mine !== generation) return
    const now = deps.now?.() ?? new Date()
    // «Как Мурка?» first: at most one per pet, and the reason a check was
    // worth watching does not wait behind a vaccination due next month.
    const asked = planFollowupReminders(deps.t(), followups, now)
    const room = REMINDER_LIMIT - asked.length
    // Both by when they fire, within the phone's limit: a due date tomorrow
    // is not pushed out by a dose next week. At the same moment a dose comes
    // first — a medicine missed matters more than a reminder of a date.
    const sorted = [...planDoseReminders(deps.t(), courses, doses, now), ...planReminders(deps.t(), due, pets, settings, now, REMINDER_LIMIT)]
      .map((reminder, order) => ({ reminder, order, at: reminderMoment(reminder.day, reminder.hour, reminder.minute).getTime() }))
      .sort((a, b) => a.at - b.at || a.order - b.order)
      .map(({ reminder }) => reminder)
    // One place kept for «откройте Лапку», when the doses run on past what the phone holds.
    const kept = sorted.slice(0, room - 1)
    const renewal = planDoseRenewal(deps.t(), courses, doses, now, kept)
    const plan = [...asked, ...(renewal ? [...kept, renewal] : sorted.slice(0, room))]
    await deps.notifier.cancelAll()
    for (const reminder of plan) {
      if (mine !== generation) return
      await deps.notifier.schedule(reminder, { petId: reminder.petId, userId: account.userId, ...reminder.data })
    }
  }

  return {
    run(account: ReminderAccount): Promise<void> {
      if (waiting) {
        waiting.account = account
        return waiting.promise
      }
      const slot: { promise: Promise<void>; account: ReminderAccount | null } = { promise: Promise.resolve(), account }
      waiting = slot
      slot.promise = serial(async () => {
        if (waiting === slot) waiting = null
        // Cleared by a sign-out while waiting: nothing to run.
        if (slot.account) await sync(slot.account, generation)
      })
      return slot.promise
    },

    clear(): Promise<void> {
      generation += 1
      if (waiting) waiting.account = null
      // Scheduled ones go, and so do the ones already on the screen: the next
      // person to sign in must not see this owner's pets (MR-08.3). And again
      // once a run in flight has stopped, in case it was mid-way through
      // scheduling. Not waited for: that run may still be loading, and
      // sign-out must not hang on the network.
      void serial(() => deps.notifier.cancelAll()).catch(() => {})
      return Promise.all([deps.notifier.cancelAll(), deps.notifier.dismissAll()]).then(() => undefined)
    },
  }
}

export type ReminderSync = ReturnType<typeof createReminderSync>

/**
 * Where a tapped reminder opens: the pet's medical record, for its own owner
 * and a pet that is still there. Anything else — another account signed in
 * since, a deleted pet, data that is not ours — goes to the pet list.
 */
export function openTarget(data: unknown, userId: string, pets: readonly { id: string }[]): string {
  const value = (data ?? {}) as { petId?: unknown; userId?: unknown; kind?: unknown; caseId?: unknown }
  if (typeof value.petId !== 'string' || !UuidSchema.safeParse(value.petId).success) return '/pets'
  if (value.userId !== userId) return '/pets'
  if (!pets.some((pet) => pet.id === value.petId)) return '/pets'
  // «Как Мурка?»: straight to the answer; a case closed meanwhile says so there.
  if (value.kind === 'followup' && typeof value.caseId === 'string' && UuidSchema.safeParse(value.caseId).success) {
    return `/pets/${value.petId}/case/${value.caseId}/checkin?from=notification`
  }
  return `/pets/${value.petId}`
}
