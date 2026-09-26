import { PARASITE_TARGETS, VACCINE_TARGETS, type HealthEvent, type HealthItem, type PetSpecies } from '@lapka/contracts'
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
  kind: HealthEvent['kind']
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
      // A planned visit has no items: it is one due date, its id standing for an item.
      event.kind === 'visit'
        ? [{
            kind: event.kind,
            eventId: event.id,
            itemId: event.id,
            date: event.date,
            item: { id: event.id, name: null, targets: [], source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null },
            others: 0,
          }]
        : event.items.map((item) => ({
        kind: event.kind,
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

/** The groups a treatment covers — fleas, ticks, worms — however fine its codes. */
export function parasiteGroups(targets: readonly string[]): Set<'fleas' | 'ticks' | 'worms'> {
  return new Set(
    PARASITE_TARGETS.filter((target) => targets.includes(target.code)).map((target) => target.group),
  )
}

/** «Блохи и клещи», «Глисты», «Блохи, клещи и глисты». */
function parasiteTitle(t: Dictionary, targets: readonly string[]): string | null {
  const groups = parasiteGroups(targets)
  const words = t.medicalRecord.parasiteTitle
  const fleas = groups.has('fleas')
  const ticks = groups.has('ticks')
  const worms = groups.has('worms')
  if (fleas && ticks && worms) return words.all
  if (fleas && ticks) return words.fleasTicks
  if (fleas && worms) return words.fleasWorms
  if (ticks && worms) return words.ticksWorms
  if (fleas) return words.fleas
  if (ticks) return words.ticks
  if (worms) return words.worms
  return null
}

/**
 * What a due row is called: the disease for a single one («Бешенство»),
 * «Комплексная прививка» for several, the owner's own name otherwise.
 */
export function itemTitle(
  t: Dictionary,
  item: Pick<HealthItem, 'name' | 'targets'>,
  kind: HealthEvent['kind'] = 'vaccination',
): string {
  if (kind === 'visit') return t.medicalRecord.visits.dueTitle
  if (kind === 'parasite') return parasiteTitle(t, item.targets) ?? item.name ?? t.medicalRecord.noProduct
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
  const parasites = parasiteGroups(targets)
  const names =
    parasites.size > 0
      ? (['fleas', 'ticks', 'worms'] as const).filter((group) => parasites.has(group)).map((group) => t.medicalRecord.parasiteGroups[group])
      : targets.map((code) => targetName(t, code))
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

/** The day of the latest done parasite treatment, if any. */
export function lastTreatment(events: readonly HealthEvent[]): string | null {
  return events
    .filter((event) => event.kind === 'parasite' && event.status === 'done')
    .reduce<string | null>((latest, event) => (latest === null || event.date > latest ? event.date : latest), null)
}

export type ParasiteStatus = {
  group: 'fleasTicks' | 'worms'
  title: string
  /** The day of the last treatment covering the group, if any. */
  last: string | null
  product: string | null
  next: { text: string; tone: DueTone } | null
}

/**
 * The two status cards of the parasites section: fleas and ticks, and worms.
 * A combined product counts in both — it is still one item and one plan.
 */
export function parasiteStatuses(t: Dictionary, events: readonly HealthEvent[], today: string): ParasiteStatus[] {
  const cards = [
    { group: 'fleasTicks' as const, covers: ['fleas', 'ticks'] as const, title: t.medicalRecord.parasiteTitle.fleasTicks },
    { group: 'worms' as const, covers: ['worms'] as const, title: t.medicalRecord.parasiteTitle.worms },
  ]
  return cards.map(({ group, covers, title }) => {
    const touches = (item: HealthItem) => {
      const groups = parasiteGroups(item.targets)
      return covers.some((cover) => groups.has(cover))
    }
    const withItem = events
      .filter((event) => event.kind === 'parasite')
      .flatMap((event) => event.items.filter(touches).map((item) => ({ event, item })))
    const last = withItem
      .filter(({ event }) => event.status === 'done')
      .sort((a, b) => b.event.date.localeCompare(a.event.date))[0]
    const next = withItem
      .filter(({ event }) => event.status === 'planned')
      .sort((a, b) => a.event.date.localeCompare(b.event.date))[0]
    const status = next ? dueStatus(t, next.event.date, today) : null
    return {
      group,
      title,
      last: last ? day(t, last.event.date, today) : null,
      product: last?.item.name ?? null,
      next: status ? { text: dueLine(status), tone: status.tone } : null,
    }
  })
}

/** «Сделано» on a due date: the record form for an item, «Был» for a planned visit. */
export function doneRoute(petId: string, due: { kind: string; itemId: string; eventId: string }): string {
  return due.kind === 'visit'
    ? `/pets/${petId}/visit-form?mode=done&eventId=${due.eventId}`
    : `/pets/${petId}/event-form?mode=complete&itemId=${due.itemId}&kind=${due.kind}`
}
