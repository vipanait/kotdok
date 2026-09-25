import { VACCINE_TARGETS, type HealthEvent, type HealthItem, type PetSpecies } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { addMonths, daysBetween } from '@/lib/calendar-day'

/**
 * Due dates and vaccination summaries, worked out for the screens. Days are
 * calendar days compared as calendar days — never milliseconds — so a due
 * date does not move at midnight or at the turn of a month (MR-03.4).
 */

export type DueTone = 'overdue' | 'soon' | 'later'

export type DueStatus = {
  tone: DueTone
  /** The words already name the day («Просрочено с 23 июля»), so the day is not added again. */
  dated?: boolean
  /** «Просрочено на 12 дней», «Через 5 дней»; null past fourteen days, where the date says it. */
  text: string | null
  /** «12 сентября», with the year when it is not this year. */
  day: string
}

/** Within this many days a due date is "soon" (spec §8). */
const SOON_DAYS = 14

function day(t: Dictionary, date: string, today: string): string {
  return t.day(date, date.slice(0, 4) !== today.slice(0, 4))
}

export function dueStatus(t: Dictionary, date: string, today: string): DueStatus {
  const words = t.medicalRecord.due
  const shown = day(t, date, today)
  const ahead = daysBetween(today, date)

  if (ahead < 0) {
    const late = -ahead
    // «Просрочено на 83 дня» stops meaning anything; the date says it better.
    if (late > 1 && addMonths(date, 2) < today) {
      return { tone: 'overdue', text: words.overdueSince(shown), day: shown, dated: true }
    }
    return { tone: 'overdue', text: late === 1 ? words.overdueYesterday : words.overdueDays(late), day: shown }
  }
  if (ahead === 0) return { tone: 'soon', text: words.today, day: shown }
  if (ahead === 1) return { tone: 'soon', text: words.tomorrow, day: shown }
  if (ahead <= SOON_DAYS) return { tone: 'soon', text: words.inDays(ahead), day: shown }
  return { tone: 'later', text: null, day: shown }
}

/** «Просрочено на 12 дней · 12 сентября», or just «12 марта 2027». */
export function dueLine(status: DueStatus): string {
  if (status.dated && status.text) return status.text
  return status.text ? `${status.text} · ${status.day}` : status.day
}

export type Due = {
  eventId: string
  itemId: string
  date: string
  item: HealthItem
  /** Other items still planned in the same record. */
  others: number
}

/** Every planned item, overdue ones first, then the soonest. */
export function dueItems(events: readonly HealthEvent[]): Due[] {
  return events
    .filter((event) => event.status === 'planned')
    .flatMap((event) =>
      event.items.map((item) => ({
        eventId: event.id,
        itemId: item.id,
        date: event.date,
        item,
        others: event.items.length - 1,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}

function targetName(t: Dictionary, code: string): string {
  return (t.medicalRecord.targets as Record<string, string>)[code] ?? code
}

/**
 * What a due row is called: the disease for a single one («Бешенство»),
 * «Комплексная прививка» for several, the owner's own name otherwise.
 */
export function itemTitle(t: Dictionary, item: Pick<HealthItem, 'name' | 'targets'>): string {
  if (item.targets.length === 1) return targetName(t, item.targets[0])
  if (item.targets.length > 1) return t.medicalRecord.complexVaccination
  return item.name ?? t.medicalRecord.noProduct
}

/** A vaccine as a record lists it: its name, or what it was against. */
export function itemName(t: Dictionary, item: Pick<HealthItem, 'name' | 'targets'>): string {
  return item.name ?? targetList(t, item.targets)
}

/** «Панлейкопения, калицивироз, ринотрахеит». */
export function targetList(t: Dictionary, targets: readonly string[]): string {
  const names = targets.map((code) => targetName(t, code))
  return names.map((name, index) => (index === 0 ? name : name.toLowerCase())).join(', ')
}

/** The day of the latest done vaccination, if any. */
export function lastVaccination(events: readonly HealthEvent[]): string | null {
  return events
    .filter((event) => event.kind === 'vaccination' && event.status === 'done')
    .reduce<string | null>((latest, event) => (latest === null || event.date > latest ? event.date : latest), null)
}

export type CoreStatus = {
  target: string
  title: string
  text: string
  tone: DueTone | 'none'
}

/**
 * The core vaccinations of a species and where each stands: the next plan,
 * else the last one done, else nothing. Never "protected until": that is a
 * medical claim the record cannot make (spec §7.5).
 */
export function coreStatuses(
  t: Dictionary,
  species: PetSpecies,
  events: readonly HealthEvent[],
  today: string,
): CoreStatus[] {
  const words = t.medicalRecord
  return VACCINE_TARGETS.filter(
    (target) => target.core && (target.species as readonly string[]).includes(species),
  ).map(({ code }) => {
    const covering = events.filter(
      (event) => event.kind === 'vaccination' && event.items.some((item) => item.targets.includes(code)),
    )
    const next = covering
      .filter((event) => event.status === 'planned')
      .sort((a, b) => a.date.localeCompare(b.date))[0]
    const last = covering
      .filter((event) => event.status === 'done')
      .sort((a, b) => b.date.localeCompare(a.date))[0]

    if (next) {
      const status = dueStatus(t, next.date, today)
      return {
        target: code,
        title: targetName(t, code),
        text: status.tone === 'later' ? words.coreNext(status.day) : dueLine(status),
        tone: status.tone,
      }
    }
    // A past vaccination always with its year: «12 марта» alone could be any March.
    if (last) return { target: code, title: targetName(t, code), text: words.coreLast(t.day(last.date, true)), tone: 'none' }
    return { target: code, title: targetName(t, code), text: words.coreNone, tone: 'none' }
  })
}

/** The same day a year later; a 29 February becomes the 28th. */
export function nextYear(date: string): string {
  return addMonths(date, 12)
}

/** «После сохранения: одна запись и 2 следующих срока на 24 сентября 2027.» */
export function saveSummary(t: Dictionary, nextDays: readonly (string | null)[], today: string): string {
  const days = nextDays.filter((next): next is string => next !== null)
  const same = days.length > 0 && days.every((next) => next === days[0])
  return t.medicalRecord.summaryDone(days.length, same ? day(t, days[0], today) : null)
}
