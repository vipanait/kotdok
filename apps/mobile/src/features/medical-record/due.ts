import type { DueItem, HealthEvent, HealthItem, PetSpecies } from '@lapka/contracts'
import type { ParasiteGroup } from '@lapka/contracts'
import { addMonths, coreVaccinations, dueEntries, dueName, dueStatusParts, dueTitleParts, itemNameParts, parasiteCovers, type DueTone } from '@lapka/shared'
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
  // Which words a date gets is the shared rule (`dueStatusParts`), the site's too.
  const parts = dueStatusParts(date, today)
  const shown = t.day(parts.day.day, parts.day.withYear)

  if (parts.tone === 'overdue') {
    switch (parts.since.kind) {
      // «Просрочено на 83 дня» stops meaning anything; the date says it better.
      case 'long':
        return { tone: 'overdue', text: words.overdueSince(shown), day: shown, dated: true }
      case 'yesterday':
        return { tone: 'overdue', text: words.overdueYesterday, day: shown }
      case 'days':
        return { tone: 'overdue', text: words.overdueDays(parts.since.days), day: shown }
    }
  }
  if (parts.tone === 'later') return { tone: 'later', text: null, day: shown }
  switch (parts.when.kind) {
    case 'today':
      return { tone: 'soon', text: words.today, day: shown }
    case 'tomorrow':
      return { tone: 'soon', text: words.tomorrow, day: shown }
    case 'inDays':
      return { tone: 'soon', text: words.inDays(parts.when.days), day: shown }
  }
}

export type DueGroup = { tone: DueTone; rows: Array<{ due: Due; status: DueStatus }> }

/**
 * Due dates as the «Напоминания» card draws them: overdue, then «Ближайшее», then
 * «Позже» (due priority design, 20 October 2026). Only for display: the
 * order inside a group is the one given, and a group with nothing in it is
 * left out, heading and all.
 */
export function dueGroups(t: Dictionary, items: readonly Due[], today: string): DueGroup[] {
  const order: DueTone[] = ['overdue', 'soon', 'later']
  const rows = items.map((due) => ({ due, status: dueStatus(t, due.date, today) }))
  return order
    .map((tone) => ({ tone, rows: rows.filter((row) => row.status.tone === tone) }))
    .filter((group) => group.rows.length > 0)
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

/** «Блохи и клещи», «Глисты», «Блохи, клещи и глисты»: the groups joined as the site joins them. */
export function groupsTitle(t: Dictionary, groups: readonly ParasiteGroup[]): string {
  const names = groups.map((group) => t.medicalRecord.parasiteGroups[group])
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t.medicalRecord.and} ${names[names.length - 1]}` : (names[0] ?? '')
  return joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase()
}

/**
 * What a due row is called: the disease for a single one («Бешенство»),
 * «Комплексная прививка» for several, the owner's own name otherwise — by
 * the shared rule (`dueTitleParts`), the site's too.
 */
export function itemTitle(
  t: Dictionary,
  item: Pick<HealthItem, 'name' | 'targets'>,
  kind: HealthEvent['kind'] = 'vaccination',
): string {
  const parts = dueTitleParts(kind, kind === 'visit' ? null : item, null)
  switch (parts.kind) {
    case 'visit':
      return t.medicalRecord.visits.dueTitle
    case 'parasiteGroups':
      return groupsTitle(t, parts.groups)
    case 'target':
      return targetName(t, parts.target)
    case 'complexVaccination':
      return t.medicalRecord.complexVaccination
    case 'name':
      return parts.name
    case 'noProduct':
      return t.medicalRecord.noProduct
  }
}

/** A vaccine as a record lists it: its name, or what it was against (shared `itemNameParts`). */
export function itemName(t: Dictionary, item: Pick<HealthItem, 'name' | 'targets'>, kind: HealthEvent['kind'] = 'vaccination'): string {
  const parts = itemNameParts(kind, item)
  switch (parts.kind) {
    case 'name':
      return parts.name
    case 'parasiteGroups':
      return targetList(t, parts.groups)
    case 'targets':
      return targetList(t, parts.targets)
    case 'noProduct':
      return t.medicalRecord.noProduct
  }
}

/** «Панлейкопения, калицивироз, ринотрахеит»; parasite groups by their words. */
export function targetList(t: Dictionary, targets: readonly string[]): string {
  const parts = itemNameParts('parasite', { name: null, targets })
  const names =
    parts.kind === 'parasiteGroups'
      ? parts.groups.map((group) => t.medicalRecord.parasiteGroups[group])
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

/** «Запишем как сделанное. Следующие — 24 сентября 2027, они появятся в напоминаниях.» */
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
 * The two status cards of the parasites section, in the app's words. Which
 * treatment is the last and which plan is next is decided once for the app
 * and the site (`parasiteCovers`, packages/shared): a combined product counts
 * in both — it is still one item and one plan.
 */
export function parasiteStatuses(t: Dictionary, events: readonly HealthEvent[], today: string): ParasiteStatus[] {
  const titles = { fleasTicks: groupsTitle(t, ['fleas', 'ticks']), worms: groupsTitle(t, ['worms']) }
  return parasiteCovers(events).map(({ cover, last, next }) => {
    const status = next ? dueStatus(t, next.event.date, today) : null
    return {
      group: cover,
      title: titles[cover],
      last: last ? day(t, last.event.date, today) : null,
      product: last?.item.name ?? null,
      next: status ? { text: dueLine(status), tone: status.tone } : null,
    }
  })
}

/**
 * Whether a due row offers «Отметить» itself: only once the day has come.
 * Beside a date still ahead the action read as a status — «Визит завтра ·
 * Сделано» (first users' feedback, FB-1/01) — so a future row opens its
 * record instead, where it can still be marked or moved.
 */
export function marksFromRow(date: string, today: string): boolean {
  return date <= today
}

/** The record a due row opens: the plan's own screen, with «Сделано»/«Был» and «Перенести». */
export function recordRoute(petId: string, due: { kind: string; eventId: string }): string {
  return `/pets/${petId}/${due.kind === 'visit' ? 'visit' : 'event'}/${due.eventId}`
}

/** «Отметить» on a due date: the record form for an item, «Был» for a planned visit. */
export function doneRoute(petId: string, due: { kind: string; itemId: string; eventId: string }): string {
  return due.kind === 'visit'
    ? `/pets/${petId}/visit-form?mode=done&eventId=${due.eventId}`
    : `/pets/${petId}/event-form?mode=complete&itemId=${due.itemId}&kind=${due.kind}`
}

/**
 * «прививка от бешенства», «обработка от блох и клещей», «визит к врачу» —
 * a due date by the shared rule `dueName` (spec §7.1), in lower case, as
 * inside a sentence; the pet list's due line starts it with a capital.
 * A visit is named by its kind only when `visitKind` is asked for: a
 * reminder says «визит к врачу» («…: визит к врачу просрочен» reads badly
 * with a second colon).
 */
export function duePhrase(
  t: Dictionary,
  item: Pick<DueItem, 'kind' | 'name' | 'targets'> & Partial<Pick<DueItem, 'visit_kind'>>,
): { text: string; form: 'f' | 'm' } {
  const words = t.reminders
  const name = dueName(item)
  switch (name.form) {
    case 'visit':
      return { text: name.visitKind ? words.visitKinds[name.visitKind] : words.visit, form: 'm' }
    case 'treatment':
      return { text: words.treatment(name.groups.map((group) => words.parasiteGroups[group])), form: 'f' }
    case 'namedTreatment':
      return { text: words.namedTreatment(name.name), form: 'f' }
    case 'plainTreatment':
      return { text: words.plainTreatment, form: 'f' }
    case 'vaccination': {
      const against = words.against[name.target]
      if (against) return { text: words.vaccination(against), form: 'f' }
      return { text: name.name ? words.namedVaccination(name.name) : words.plainVaccination, form: 'f' }
    }
    case 'complexVaccination':
      return { text: words.complexVaccination, form: 'f' }
    case 'namedVaccination':
      return { text: words.namedVaccination(name.name), form: 'f' }
    case 'plainVaccination':
      return { text: words.plainVaccination, form: 'f' }
  }
}

/**
 * A visit in a line of its own — «визит к врачу (осмотр)» — for the calendar
 * and the sitter memo, where «визит к врачу: осмотр» would follow another
 * colon. «Другое» names nothing and is left out.
 */
export function visitPhrase(t: Dictionary, kind: HealthEvent['visit_kind']): string {
  const visit = t.medicalRecord.visits.dueTitle.toLowerCase()
  return kind && kind !== 'other' ? `${visit} (${t.medicalRecord.visits.kindsShort[kind].toLowerCase()})` : visit
}

/**
 * The pet list's due line names the date (spec §7.1): «Прививка от
 * бешенства», «Обработка от блох и клещей», «Визит к врачу: осмотр» — as
 * the site's pet rows (`dueLineTitle` there), by the same shared rule.
 */
export function dueLineTitle(t: Dictionary, due: Pick<DueItem, 'kind' | 'name' | 'targets'> & Partial<Pick<DueItem, 'visit_kind'>>): string {
  const { text } = duePhrase(t, due)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type ListDueLine = { tone: 'overdue' | 'soon'; title: string; status: string; text: string }

/**
 * The pet list's line in two parts: the name (`dueLineTitle`) and its status
 * («— просрочено», «— через 5 дней»). The row cuts the name with an ellipsis
 * on a narrow screen and always shows the status whole (MW-09 review), as
 * the site's pet rows do; `text` is the whole line, for the screen reader.
 * Null for a date past the fourteen "soon" days.
 */
export function listDueLine(t: Dictionary, due: Pick<DueItem, 'kind' | 'name' | 'targets' | 'date'> & Partial<Pick<DueItem, 'visit_kind'>>, today: string): ListDueLine | null {
  const status = dueStatus(t, due.date, today)
  if (status.tone === 'later') return null
  const title = dueLineTitle(t, due)
  const words = t.medicalRecord.listDue
  const tail = status.tone === 'overdue' ? words.overdue : words.soon((status.text ?? status.day).toLowerCase())
  return { tone: status.tone, title, status: tail, text: `${title} ${tail}` }
}
