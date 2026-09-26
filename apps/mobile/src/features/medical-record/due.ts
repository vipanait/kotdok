import type { HealthEvent, HealthItem, PetSpecies } from '@lapka/contracts'
import { addMonths, coreVaccinations, dueEntries, dueTiming, parasiteGroups, type DueTone } from '@lapka/shared'
import type { Dictionary } from '@/i18n'

/**
 * Due dates and vaccination summaries, in the app's words. Which dates are
 * due, in what order, and how far away (overdue, the 14 "soon" days, "since"
 * past two months) is decided once for the app and the site, in
 * packages/shared (medical-record/record-overview.ts). Days are calendar
 * days compared as calendar days, so a due date does not move at midnight
 * or at the turn of a month (MR-03.4).
 */

export type { DueTone }

export type DueStatus = {
  tone: DueTone
  /** The words already name the day («Просрочено с 23 июля»), so the day is not added again. */
  dated?: boolean
  /** «Просрочено на 12 дней», «Через 5 дней»; null past fourteen days, where the date says it. */
  text: string | null
  /** «12 сентября», with the year when it is not this year. */
  day: string
}

function day(t: Dictionary, date: string, today: string): string {
  return t.day(date, date.slice(0, 4) !== today.slice(0, 4))
}

export function dueStatus(t: Dictionary, date: string, today: string): DueStatus {
  const words = t.medicalRecord.due
  const shown = day(t, date, today)
  const timing = dueTiming(date, today)

  if (timing.tone === 'overdue') {
    // «Просрочено на 83 дня» stops meaning anything; the date says it better.
    if (timing.longOverdue) return { tone: 'overdue', text: words.overdueSince(shown), day: shown, dated: true }
    const late = -timing.days
    return { tone: 'overdue', text: late === 1 ? words.overdueYesterday : words.overdueDays(late), day: shown }
  }
  if (timing.tone === 'later') return { tone: 'later', text: null, day: shown }
  if (timing.days === 0) return { tone: 'soon', text: words.today, day: shown }
  if (timing.days === 1) return { tone: 'soon', text: words.tomorrow, day: shown }
  return { tone: 'soon', text: words.inDays(timing.days), day: shown }
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

/** Every planned item, overdue ones first, then the soonest (the shared order). */
export function dueItems(events: readonly HealthEvent[]): Due[] {
  return dueEntries(events).map((entry) =>
    entry.item === null
      ? {
          // A planned visit has no items: it is one due date, its id standing for an item.
          kind: entry.kind,
          eventId: entry.event.id,
          itemId: entry.key,
          date: entry.date,
          item: { id: entry.event.id, name: null, targets: [], source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null },
          others: 0,
        }
      : {
          kind: entry.kind,
          eventId: entry.event.id,
          itemId: entry.key,
          date: entry.date,
          item: entry.item,
          others: entry.event.items.length - 1,
        },
  )
}

function targetName(t: Dictionary, code: string): string {
  return (t.medicalRecord.targets as Record<string, string>)[code] ?? code
}

/** «Блохи и клещи», «Глисты», «Блохи, клещи и глисты». */
function parasiteTitle(t: Dictionary, targets: readonly string[]): string | null {
  const groups = parasiteGroups(targets)
  const words = t.medicalRecord.parasiteTitle
  const fleas = groups.includes('fleas')
  const ticks = groups.includes('ticks')
  const worms = groups.includes('worms')
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
    parasites.length > 0
      ? parasites.map((group) => t.medicalRecord.parasiteGroups[group])
      : targets.map((code) => targetName(t, code))
  return names.map((name, index) => (index === 0 ? name : name.toLowerCase())).join(', ')
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
  // Where each stands is decided once for the app and the site (packages/shared, event-entry.ts).
  return coreVaccinations(species, events).map(({ target, next, last }) => {
    if (next) {
      const status = dueStatus(t, next, today)
      return {
        target,
        title: targetName(t, target),
        text: status.tone === 'later' ? words.coreNext(status.day) : dueLine(status),
        tone: status.tone,
      }
    }
    // A past vaccination always with its year: «12 марта» alone could be any March.
    if (last) return { target, title: targetName(t, target), text: words.coreLast(t.day(last, true)), tone: 'none' }
    return { target, title: targetName(t, target), text: words.coreNone, tone: 'none' }
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
      return covers.some((cover) => groups.includes(cover))
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
