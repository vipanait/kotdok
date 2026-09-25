import type { DueItem } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { dayParts } from '@/lib/calendar-day'
import { parasiteGroups } from '../due'

/** This phone's choices (spec §7.20). Kept on the device, not in the account. */
export type ReminderSettings = {
  enabled: boolean
  daysBefore: 1 | 3 | 7
  /** 8…21, on the phone's clock. */
  hour: number
}

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: true, daysBefore: 3, hour: 10 }
export const REMINDER_HOURS: readonly number[] = Array.from({ length: 14 }, (_, index) => 8 + index)

/** iOS keeps at most 64 scheduled; the nearest are the ones that matter. */
export const REMINDER_LIMIT = 64

/** A missed plan is brought up once more, a week after its day. */
const OVERDUE_AFTER_DAYS = 7

export type PlannedReminder = {
  /** Stable for a pet and a day, so a rescheduled plan replaces the old one. */
  id: string
  petId: string
  /** The phone's calendar day and hour it fires at. */
  day: string
  hour: number
  title: string
  body: string
}

type Phase = 'today' | 'before' | 'overdue'
const PHASE_ORDER: Phase[] = ['today', 'before', 'overdue']

function addDays(day: string, days: number): string {
  const { year, month, date } = dayParts(day)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

/** The moment a reminder fires: that hour on the wall clock of that day, whatever the offset. */
export function reminderMoment(day: string, hour: number): Date {
  const { year, month, date } = dayParts(day)
  return new Date(year, month - 1, date, hour, 0, 0, 0)
}

const GROUP_ORDER = ['fleas', 'ticks', 'worms'] as const

/** «прививка от бешенства», «обработка от блох и клещей», «визит к врачу». */
function itemPhrase(t: Dictionary, item: DueItem): { text: string; form: 'f' | 'm' } {
  const words = t.reminders
  if (item.kind === 'visit') return { text: words.visit, form: 'm' }
  if (item.kind === 'parasite') {
    const groups = parasiteGroups(item.targets)
    if (groups.size > 0) {
      return { text: words.treatment(GROUP_ORDER.filter((group) => groups.has(group)).map((group) => words.parasiteGroups[group])), form: 'f' }
    }
    return { text: item.name ? words.namedTreatment(item.name) : words.plainTreatment, form: 'f' }
  }
  if (item.targets.length === 1 && words.against[item.targets[0]]) {
    return { text: words.vaccination(words.against[item.targets[0]]), form: 'f' }
  }
  if (item.targets.length > 1) return { text: words.complexVaccination, form: 'f' }
  return { text: item.name ? words.namedVaccination(item.name) : words.plainVaccination, form: 'f' }
}

/** One item by name; several as a count — «2 прививки», or «3 срока» when the kinds differ. */
function what(t: Dictionary, items: readonly DueItem[]): { text: string; form: 'f' | 'm' | 'pl' } {
  if (items.length === 1) return itemPhrase(t, items[0])
  const kinds = new Set(items.map((item) => item.kind))
  const kind = kinds.size === 1 ? (items[0].kind as 'vaccination' | 'parasite' | 'visit') : 'mixed'
  return { text: t.reminders.count(kind, items.length), form: 'pl' }
}

/** «Напомнить о бешенстве?»: what the permission sheet asks about. */
export function reminderAbout(t: Dictionary, item: Pick<DueItem, 'kind' | 'name' | 'targets'>): string {
  const words = t.reminders
  if (item.kind === 'visit') return words.aboutVisit
  if (item.kind === 'parasite') {
    const groups = parasiteGroups(item.targets)
    if (groups.size > 0) return words.aboutTreatment(GROUP_ORDER.filter((group) => groups.has(group)).map((group) => words.parasiteGroups[group]))
    return words.aboutPlainTreatment
  }
  if (item.targets.length === 1 && words.about[item.targets[0]]) return words.about[item.targets[0]]
  if (item.targets.length > 1) return words.aboutComplex
  return item.name ? words.aboutNamedVaccination(item.name) : words.aboutVaccination
}

/**
 * Every notification the open plans call for (spec §7.21): some days before,
 * on the day, and a week after if still open. One per pet per day — several
 * plans falling on it share it. Only what is still ahead, the nearest
 * {@link REMINDER_LIMIT}. Pets not in `pets` (deleted, or another account's)
 * get none.
 */
export function planReminders(
  t: Dictionary,
  due: readonly DueItem[],
  pets: readonly { id: string; name: string }[],
  settings: ReminderSettings,
  now: Date = new Date(),
): PlannedReminder[] {
  if (!settings.enabled) return []
  const names = new Map(pets.map((pet) => [pet.id, pet.name]))

  const groups = new Map<string, { petId: string; day: string; phases: Map<Phase, DueItem[]> }>()
  for (const item of due) {
    if (!names.has(item.pet_id)) continue
    const moments: [Phase, string][] = [
      ['before', addDays(item.date, -settings.daysBefore)],
      ['today', item.date],
      ['overdue', addDays(item.date, OVERDUE_AFTER_DAYS)],
    ]
    for (const [phase, day] of moments) {
      if (reminderMoment(day, settings.hour) <= now) continue
      const key = `${item.pet_id}|${day}`
      const group = groups.get(key) ?? { petId: item.pet_id, day, phases: new Map<Phase, DueItem[]>() }
      group.phases.set(phase, [...(group.phases.get(phase) ?? []), item])
      groups.set(key, group)
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.day.localeCompare(b.day) || a.petId.localeCompare(b.petId))
    .slice(0, REMINDER_LIMIT)
    .map((group) => {
      const pet = names.get(group.petId)!
      const lines = PHASE_ORDER.filter((phase) => group.phases.has(phase)).map((phase) => {
        const subject = what(t, group.phases.get(phase)!)
        if (phase === 'today') return t.reminders.today(pet, subject.text)
        if (phase === 'before') return t.reminders.before(pet, settings.daysBefore, subject.text)
        return t.reminders.overdue(pet, subject.text, subject.form)
      })
      return {
        id: `lapka-reminder-${group.petId}-${group.day}`,
        petId: group.petId,
        day: group.day,
        hour: settings.hour,
        title: t.reminders.notificationTitle,
        body: lines.join('\n'),
      }
    })
}

