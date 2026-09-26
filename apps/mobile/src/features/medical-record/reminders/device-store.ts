import type { SecureStorage } from '@/lib/session-storage'
import { DEFAULT_REMINDERS, REMINDER_HOURS, type ReminderSettings } from './schedule'

const SETTINGS_KEY = 'lapka.reminders.settings'
const NOT_NOW_KEY = 'lapka.reminders.notNowUntil'
const NOT_NOW_DAYS = 30

/**
 * Settings from storage, each field checked on its own: a value written by a
 * later build, or damaged, falls back to its default without taking the
 * others with it.
 */
export function readSettings(raw: string | null): ReminderSettings {
  let stored: Partial<Record<keyof ReminderSettings, unknown>> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') stored = parsed as typeof stored
  } catch {
    stored = {}
  }
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_REMINDERS.enabled,
    daysBefore: stored.daysBefore === 1 || stored.daysBefore === 3 || stored.daysBefore === 7 ? stored.daysBefore : DEFAULT_REMINDERS.daysBefore,
    hour: typeof stored.hour === 'number' && REMINDER_HOURS.includes(stored.hour) ? stored.hour : DEFAULT_REMINDERS.hour,
  }
}

/** «Не сейчас» keeps the sheet away for 30 days. */
export function askAgainAfter(now: Date): Date {
  return new Date(now.getTime() + NOT_NOW_DAYS * 86_400_000)
}

export function shouldAsk(notNowUntil: Date | null, now: Date = new Date()): boolean {
  return notNowUntil === null || now > notNowUntil
}

/**
 * Reminder choices kept on this phone (spec §7.20): they belong to the
 * device, so signing out leaves them — the next account on this phone gets the
 * same hour, and reminders only ever come from the account signed in.
 */
export function createReminderStore(storage: SecureStorage) {
  return {
    async settings(): Promise<ReminderSettings> {
      return readSettings(await storage.getItemAsync(SETTINGS_KEY).catch(() => null))
    },
    saveSettings(settings: ReminderSettings): Promise<void> {
      return storage.setItemAsync(SETTINGS_KEY, JSON.stringify(settings))
    },
    async notNowUntil(): Promise<Date | null> {
      const raw = await storage.getItemAsync(NOT_NOW_KEY).catch(() => null)
      const time = raw ? Date.parse(raw) : Number.NaN
      return Number.isNaN(time) ? null : new Date(time)
    },
    notNow(now: Date = new Date()): Promise<void> {
      return storage.setItemAsync(NOT_NOW_KEY, askAgainAfter(now).toISOString())
    },
  }
}

export type ReminderStore = ReturnType<typeof createReminderStore>
