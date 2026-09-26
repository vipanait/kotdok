import type { DueItem } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { planReminders, type PlannedReminder, type ReminderSettings } from './schedule'

/** The slice of expo-notifications this needs, so tests need no native module. */
export type Notifier = {
  granted(): Promise<boolean>
  cancelAll(): Promise<void>
  /** Takes delivered notifications off the lock screen and the list. */
  dismissAll(): Promise<void>
  schedule(reminder: PlannedReminder, data: { petId: string; userId: string }): Promise<void>
}

export type ReminderAccount = {
  userId: string
  load(): Promise<{ due: DueItem[]; pets: { id: string; name: string }[] }>
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
    const { due, pets } = await account.load()
    if (mine !== generation) return
    const plan = planReminders(deps.t(), due, pets, settings, deps.now?.() ?? new Date())
    await deps.notifier.cancelAll()
    for (const reminder of plan) {
      if (mine !== generation) return
      await deps.notifier.schedule(reminder, { petId: reminder.petId, userId: account.userId })
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Where a tapped reminder opens: the pet's medical record, for its own owner
 * and a pet that is still there. Anything else — another account signed in
 * since, a deleted pet, data that is not ours — goes to the pet list.
 */
export function openTarget(data: unknown, userId: string, pets: readonly { id: string }[]): string {
  const value = (data ?? {}) as { petId?: unknown; userId?: unknown }
  if (typeof value.petId !== 'string' || !UUID.test(value.petId)) return '/pets'
  if (value.userId !== userId) return '/pets'
  if (!pets.some((pet) => pet.id === value.petId)) return '/pets'
  return `/pets/${value.petId}`
}
