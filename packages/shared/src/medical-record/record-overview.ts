import {
  PARASITE_TARGETS,
  type HealthEvent,
  type HealthItem,
  type Medication,
  type ParasiteGroup,
  type WeightMeasurement,
} from '@lapka/contracts'

/**
 * The rules of the medical record overview, without words: which dates are
 * due and how far away they are, what was done last, how the weight moved.
 * Each app puts these into its own language; the arithmetic stays one.
 *
 * Days are calendar days (`YYYY-MM-DD`) compared as calendar days — never a
 * moment in local time, where a day can quietly become the one before it.
 */

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Today on the owner's calendar, from the device's own clock and zone: a
 * weighing at 01:00 in Moscow is not yesterday's.
 */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** The same day `months` later (or earlier); 31 January plus a month is 28/29 February. */
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date, lastDay))
  return target.toISOString().slice(0, 10)
}

/** Full months from `from` to `to`. */
export function monthsBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
}

/** Within this many days a due date is "soon" (spec §8). */
export const DUE_SOON_DAYS = 14

export type DueTone = 'overdue' | 'soon' | 'later'

export type DueTiming = {
  tone: DueTone
  /** Days from today to the date: negative when overdue, 0 today. */
  days: number
  /**
   * Overdue by more than two months: «просрочено на 83 дня» stops meaning
   * anything, the date says it better («просрочено с 12 июня»).
   */
  longOverdue: boolean
}

export function dueTiming(date: string, today: string): DueTiming {
  const days = daysBetween(today, date)
  if (days < 0) return { tone: 'overdue', days, longOverdue: days < -1 && addMonths(date, 2) < today }
  return { tone: days <= DUE_SOON_DAYS ? 'soon' : 'later', days, longOverdue: false }
}

export type DueEntry = {
  kind: HealthEvent['kind']
  event: HealthEvent
  /** The planned item; null for a planned visit, which is one due date by itself. */
  item: HealthItem | null
  /** What «Сделано» acts on: the item, or the visit itself. */
  key: string
  date: string
}

/**
 * Every planned item and planned visit, earliest first — so the overdue ones
 * come first, then the soonest. Ties keep the order of the records.
 */
export function dueEntries(events: readonly HealthEvent[]): DueEntry[] {
  return events
    .filter((event) => event.status === 'planned')
    .flatMap<DueEntry>((event) =>
      event.kind === 'visit'
        ? [{ kind: event.kind, event, item: null, key: event.id, date: event.date }]
        : event.items.map((item) => ({ kind: event.kind, event, item, key: item.id, date: event.date })),
    )
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .map(({ entry }) => entry)
}

/** Done records of a kind, newest first. */
export function doneEvents(events: readonly HealthEvent[], kind: HealthEvent['kind']): HealthEvent[] {
  return events
    .filter((event) => event.kind === kind && event.status === 'done')
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Planned records of a kind, soonest first. */
export function plannedEvents(events: readonly HealthEvent[], kind: HealthEvent['kind']): HealthEvent[] {
  return events
    .filter((event) => event.kind === kind && event.status === 'planned')
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** The day of the latest done record of a kind, if any. */
export function lastDoneDate(events: readonly HealthEvent[], kind: HealthEvent['kind']): string | null {
  return doneEvents(events, kind)[0]?.date ?? null
}

/** The groups a treatment covers — fleas, ticks, worms — however fine its codes. */
export function parasiteGroups(targets: readonly string[]): ParasiteGroup[] {
  const covered = new Set(PARASITE_TARGETS.filter((target) => targets.includes(target.code)).map((target) => target.group))
  return (['fleas', 'ticks', 'worms'] as const).filter((group) => covered.has(group))
}

/** The two parasite status cards: fleas with ticks, and worms (spec §5.1, web v1 «parasites»). */
export type ParasiteCover = 'fleasTicks' | 'worms'

const COVER_GROUPS: Record<ParasiteCover, readonly ParasiteGroup[]> = { fleasTicks: ['fleas', 'ticks'], worms: ['worms'] }

export type ParasiteMark = { event: HealthEvent; item: HealthItem }

export type ParasiteCoverStatus = {
  cover: ParasiteCover
  /** The latest done treatment covering it. */
  last: ParasiteMark | null
  /** The earliest plan covering it: what «Сделано» acts on. */
  next: ParasiteMark | null
}

/**
 * Where each parasite card stands, from the records alone: the latest done
 * treatment and the earliest plan that touch its groups. A combined product
 * counts on both cards — it is still one item and one plan. The phone and
 * the site put it in their own words.
 */
export function parasiteCovers(events: readonly HealthEvent[]): ParasiteCoverStatus[] {
  return (['fleasTicks', 'worms'] as const).map((cover) => {
    const touches = (item: HealthItem) => parasiteGroups(item.targets).some((group) => COVER_GROUPS[cover].includes(group))
    const marks = events
      .filter((event) => event.kind === 'parasite')
      .flatMap((event) => event.items.filter(touches).map((item) => ({ event, item })))
    const last = marks
      .filter(({ event }) => event.status === 'done')
      .sort((a, b) => b.event.date.localeCompare(a.event.date))[0]
    const next = marks
      .filter(({ event }) => event.status === 'planned')
      .sort((a, b) => a.event.date.localeCompare(b.event.date))[0]
    return { cover, last: last ?? null, next: next ?? null }
  })
}

export type DatedWeight = WeightMeasurement & { measured_on: string }

/** Dated measurements, oldest first: the form's undated value has no place on a time axis. */
export function datedWeights(weights: readonly WeightMeasurement[]): DatedWeight[] {
  return weights
    .filter((weight): weight is DatedWeight => weight.measured_on !== null)
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on))
}

export type WeightPeriod = 'halfYear' | 'year' | 'all'

/** The period's dated measurements, oldest first. */
export function weightsInPeriod(weights: readonly WeightMeasurement[], period: WeightPeriod, today: string): DatedWeight[] {
  const since = period === 'all' ? '' : addMonths(today, period === 'halfYear' ? -6 : -12)
  return datedWeights(weights).filter((weight) => weight.measured_on >= since)
}

export type WeightTrend = {
  /** Kilograms, rounded to 0.1: negative when the pet got lighter. */
  change: number
  /** The span between the two points: full months, or days under a month. */
  months: number
  days: number
}

/**
 * The latest weight against the earliest one of the period — the past year
 * unless a screen asks for its chart's period; null below two points.
 * Neutral on purpose: losing weight is sometimes the goal and sometimes the
 * symptom, and the record cannot tell which.
 */
export function weightTrend(
  weights: readonly WeightMeasurement[],
  today: string,
  period: WeightPeriod = 'year',
): WeightTrend | null {
  const points = weightsInPeriod(weights, period, today)
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  return {
    change: Math.round((last.weight_kg - first.weight_kg) * 10) / 10,
    months: monthsBetween(first.measured_on, last.measured_on),
    days: daysBetween(first.measured_on, last.measured_on),
  }
}

/** Current until its end: a course that ended today is done (its last dose was today). */
export function isCurrentCourse(course: Pick<Medication, 'ended_on'>, today: string): boolean {
  return course.ended_on === null || course.ended_on > today
}

/**
 * Being given now: current and already begun (a course from the pet form has
 * no start and counts). «Принимает сейчас» — in the record's «Важно знать»,
 * in the summary for the vet — lists these and nothing else: a course that
 * starts later is prescribed, not taken, and a vet reading it as taken would
 * be misled. The medicines list still shows it under «Сейчас» with its start
 * date, since it is neither finished nor history.
 */
export function isTakenNow(course: Pick<Medication, 'started_on' | 'ended_on'>, today: string): boolean {
  return isCurrentCourse(course, today) && (course.started_on === null || course.started_on <= today)
}

/**
 * Current courses, latest start first; then finished ones, latest end first
 * (courses ending the same day keep the latest start first).
 */
export function splitCourses<T extends Pick<Medication, 'started_on' | 'ended_on'>>(courses: readonly T[], today: string) {
  const byStart = [...courses].sort((a, b) => (b.started_on ?? '').localeCompare(a.started_on ?? ''))
  return {
    current: byStart.filter((course) => isCurrentCourse(course, today)),
    past: byStart
      .filter((course) => !isCurrentCourse(course, today))
      .sort((a, b) => (b.ended_on ?? '').localeCompare(a.ended_on ?? '')),
  }
}
