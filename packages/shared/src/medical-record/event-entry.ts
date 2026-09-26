import {
  CalendarDateSchema,
  PARASITE_TARGETS,
  VACCINE_TARGETS,
  type HealthEvent,
  type HealthTarget,
  type ParasiteGroup,
  type PetSpecies,
  type VaccineTarget,
} from '@lapka/contracts'
import { addInterval, type Interval } from './catalog-search'

/**
 * The rules of the vaccination and treatment forms that the web and the
 * phone share: which diseases an item can name, how a parasite group is
 * switched, what next date is suggested, and where each core vaccination
 * stands. No UI here and no text: each app says it in its own words.
 */

/** A species' vaccination targets, core ones first, in the contract's order. */
export function vaccineTargetsFor(species: PetSpecies): VaccineTarget[] {
  const fits = VACCINE_TARGETS.filter((target) => (target.species as readonly string[]).includes(species))
  return [...fits.filter((target) => target.core), ...fits.filter((target) => !target.core)].map((target) => target.code)
}

/** The three groups a treatment is chosen by, in the order the screens show them (spec §5.1). */
export const PARASITE_GROUPS: readonly ParasiteGroup[] = ['fleas', 'ticks', 'worms']

/**
 * A parasite chip is a group — блохи, клещи, глисты. Turning it off removes
 * every code in the group (a picked product's ear mites go with ticks);
 * turning it on adds the group's own code.
 */
export function toggleParasiteGroup(targets: readonly HealthTarget[], group: ParasiteGroup): HealthTarget[] {
  const inGroup = PARASITE_TARGETS.filter((target) => target.group === group).map((target) => target.code as string)
  const has = targets.some((target) => inGroup.includes(target))
  return has ? targets.filter((target) => !inGroup.includes(target)) : [...targets, group as HealthTarget]
}

/**
 * The interval the phone falls back on when an item has none from the
 * catalogue: a year for a vaccine; for a treatment, three months against
 * worms alone and a month otherwise.
 */
export function fallbackInterval(kind: HealthEvent['kind'], targets: readonly string[]): Interval {
  if (kind === 'vaccination') return { value: 1, unit: 'year' }
  const wormsOnly = targets.length > 0 && targets.every((target) => target === 'worms' || target === 'heartworm')
  return wormsOnly ? { value: 3, unit: 'month' } : { value: 1, unit: 'month' }
}

/**
 * The next date an interval suggests after a record's day — a suggestion,
 * never a prescription. None when there is no interval, or when it lands
 * before today: «через год» from a vaccination two years ago would only
 * fill backfilled history with overdue reminders, and the server refuses a
 * plan in the past.
 */
export function suggestNextDay(recordDay: string, interval: Interval | null, today: string): string | null {
  if (!interval) return null
  const next = addInterval(recordDay, interval)
  return next >= today ? next : null
}

/** Why a record's day cannot be saved, as the phone and the site both check it before sending. */
export type EventDayProblem = 'empty' | 'invalid' | 'future' | 'past'

/**
 * The day of a vaccination or treatment record (MR-03.3): something done is
 * not after today, a plan is today or later. A plan being corrected may keep
 * its own day even once it has passed — only a new day has to be ahead, so an
 * overdue plan can still be fixed. `day` is `YYYY-MM-DD` or '' when none was
 * given; the contract's own schema decides whether it is a real day.
 */
export function eventDayProblem(
  day: string,
  status: HealthEvent['status'],
  today: string,
  keptDay: string | null = null,
): EventDayProblem | null {
  if (day === '') return 'empty'
  if (!CalendarDateSchema.safeParse(day).success) return 'invalid'
  if (keptDay !== null && day === keptDay) return null
  if (status === 'done' && day > today) return 'future'
  if (status === 'planned' && day < today) return 'past'
  return null
}

/** Why an item's next date cannot be saved. */
export type NextDayProblem = 'invalid' | 'notAfter' | 'past'

/**
 * The next date of a done item: a real day after the record's own day and
 * not before today — the server refuses a plan in the past. `recordDay` null
 * when the record's day is itself not readable yet: only the other rules apply.
 */
export function nextDayProblem(next: string, recordDay: string | null, today: string): NextDayProblem | null {
  if (!CalendarDateSchema.safeParse(next).success) return 'invalid'
  if (recordDay !== null && next <= recordDay) return 'notAfter'
  if (next < today) return 'past'
  return null
}

/**
 * The earliest next date `nextDayProblem` accepts, for a date picker's `min`:
 * the day after the record's day, and not before today. `recordDay` '' or
 * null when the record has no readable day yet: today.
 */
export function nextDayMin(recordDay: string | null, today: string): string {
  if (!recordDay || !CalendarDateSchema.safeParse(recordDay).success) return today
  const after = addInterval(recordDay, { value: 1, unit: 'day' })
  return after > today ? after : today
}

export type CoreVaccination = {
  target: VaccineTarget
  /** The earliest plan that covers it. */
  next: string | null
  /** The latest done vaccination that covers it. */
  last: string | null
}

/**
 * The core vaccinations of a species (spec §7.5) and where each stands, from
 * the records only: the form's «привит» has no date and does not count as
 * one. Never "protected until": that is a medical claim the record cannot
 * make.
 */
export function coreVaccinations(species: PetSpecies, events: readonly HealthEvent[]): CoreVaccination[] {
  return VACCINE_TARGETS.filter((target) => target.core && (target.species as readonly string[]).includes(species)).map(
    ({ code }) => {
      const covering = events.filter(
        (event) => event.kind === 'vaccination' && event.items.some((item) => item.targets.includes(code)),
      )
      const planned = covering.filter((event) => event.status === 'planned').map((event) => event.date).sort()
      const done = covering.filter((event) => event.status === 'done').map((event) => event.date).sort()
      return { target: code, next: planned[0] ?? null, last: done[done.length - 1] ?? null }
    },
  )
}

/**
 * The plans a done item was followed by: its next date, as the record view
 * shows it. A plan made from an item names it as `source_item_id`.
 */
export function nextDayOf(itemId: string, events: readonly HealthEvent[]): string | null {
  const days = events
    .filter((event) => event.status === 'planned' && event.items.some((item) => item.source_item_id === itemId))
    .map((event) => event.date)
    .sort()
  return days[0] ?? null
}
