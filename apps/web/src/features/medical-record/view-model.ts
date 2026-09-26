import type { HealthEvent, HealthItem, HealthOverview, HealthSection, Medication, Pet } from '@lapka/contracts'
import {
  chartLayout,
  chartTicks,
  chartY,
  datedWeights,
  doneEvents,
  dueEntries,
  dueTiming,
  parasiteGroups,
  plannedEvents,
  splitCourses,
  weightTrend,
  weightsInPeriod,
  type DueEntry,
  type DueTone,
  type WeightTrend,
} from '@lapka/shared'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import {
  MEDICAL_RECORD_STAGE,
  completeOpen,
  heldOpen,
  medicalRecordHref,
  sectionOpen,
  type CompleteFrom,
  type MedicalRecordStage,
} from './stage'

/**
 * What the medical record page says, worked out from the overview. No React
 * here: the rules — the form's answers shown without made-up dates, an empty
 * list read as "not said" rather than "none" — are unit tested.
 */

type Words = Dictionary['medicalRecord']

// ---------- Dates and numbers ----------

/** «12 сентября», «12 марта 2027»; the year only when asked for. A calendar day, no time zone. */
export function formatDay(words: Words, day: string, withYear: boolean): string {
  const [year, month, date] = day.split('-').map(Number)
  return (withYear ? words.dayYearFormat : words.dayFormat)
    .replace('{d}', String(date))
    .replace('{m}', words.months[month - 1] ?? '')
    .replace('{y}', String(year))
}

/** The year when the day is not in the current one. */
function day(words: Words, date: string, today: string): string {
  return formatDay(words, date, date.slice(0, 4) !== today.slice(0, 4))
}

/** «12 сентября» this year, «12 марта 2025» in another. */
export const recordDay = day

/** «2–15 августа», «28 июля – 15 августа», with years when the course is not all in this year. */
export function formatRange(words: Words, from: string, to: string, today: string): string {
  // A one-day course: its day, once.
  if (from === to) return day(words, from, today)
  const withYear = from.slice(0, 4) !== to.slice(0, 4) || to.slice(0, 4) !== today.slice(0, 4)
  if (!withYear && from.slice(0, 7) === to.slice(0, 7) && words.dayFormat.startsWith('{d}')) {
    return `${Number(from.slice(8))}–${formatDay(words, to, false)}`
  }
  return words.medications.range.replace('{from}', formatDay(words, from, withYear)).replace('{to}', formatDay(words, to, withYear))
}

/** «4,2» in Russian, «4.2» in English; one decimal at most. */
export function formatDecimal(words: Words, value: number): string {
  const rounded = Math.round(value * 10) / 10
  return String(rounded).replace('.', words.decimalSeparator)
}

export function formatWeight(words: Words, kg: number): string {
  return words.weight.replace('{n}', formatDecimal(words, kg))
}

// ---------- Head ----------

export type HeadFacts = {
  name: string
  /** «Кошка · Сибирская · 3 года · стерилизована»: only what the form has. */
  meta: string
  weight: string | null
  /** The trend, the day of the last weighing, or that the form's weight has no date. */
  weightNote: string | null
}

function speciesWord(words: Words, pet: Pet): string {
  return words.animal[pet.species][pet.sex ?? 'unknown']
}

export function headFacts(dict: Dictionary, locale: Locale, overview: HealthOverview, today: string): HeadFacts {
  const words = dict.medicalRecord
  const { pet } = overview
  const parts = [speciesWord(words, pet)]
  const breed = pet.breed?.trim()
  if (breed) parts.push(breed)
  // An age of 0 is an unfilled field, not a newborn (as on the pet list).
  if (pet.age_years != null && pet.age_years > 0) parts.push(formatCount(dict.pets.age, pet.age_years, locale))
  if (pet.neutered === true) parts.push(words.neutered[pet.sex ?? 'unknown'])

  return {
    name: pet.name,
    meta: parts.join(' · '),
    weight: pet.weight_kg === null ? null : formatWeight(words, pet.weight_kg),
    weightNote: pet.weight_kg === null ? null : weightNote(dict, locale, overview, today),
  }
}

function spanText(dict: Dictionary, locale: Locale, months: number, days: number): string {
  const words = dict.medicalRecord
  return months >= 1 ? formatCount(words.monthsSpan, months, locale) : formatCount(words.daysSpan, days, locale)
}

/** «−0,3 кг за 6 месяцев», «Без изменений за 1 месяц»: neutral, never "better" or "worse". */
export function trendText(dict: Dictionary, locale: Locale, trend: WeightTrend): string {
  const words = dict.medicalRecord
  const span = spanText(dict, locale, trend.months, trend.days)
  if (trend.change === 0) return words.noChange.replace('{span}', span)
  const change = `${trend.change < 0 ? '−' : '+'}${formatDecimal(words, Math.abs(trend.change))}`
  return words.trend.replace('{change}', change).replace('{span}', span)
}

function weightNote(dict: Dictionary, locale: Locale, overview: HealthOverview, today: string): string {
  const words = dict.medicalRecord
  const dated = datedWeights(overview.weights)
  const latest = dated[dated.length - 1]
  // The form's value with no weighing behind it: its day is unknown and is not made up.
  if (!latest) return words.weightFromForm
  const trend = weightTrend(overview.weights, today)
  return trend ? trendText(dict, locale, trend) : day(words, latest.measured_on, today)
}

// ---------- Due dates ----------

export type DueRow = {
  key: string
  kind: HealthEvent['kind']
  title: string
  /** «Просрочено на 12 дней · 12 сентября», «Через 9 дней · 3 октября», «12 марта 2027». */
  status: string
  tone: DueTone
  /** «Сделано» for this one item, «Состоялся» for a planned visit; null where the site does not offer it. */
  completeHref: string | null
  /** «Сделано» or «Состоялся». */
  completeText: string
  /** «Сделано: Блохи и клещи, просрочено на 12 дней · 12 сентября» — the button's accessible name. */
  completeLabel: string
}

export type DueBlock = { rows: DueRow[]; total: number }

/** In the record: the first three; the rest are counted (implementation-handoff, «Поведение»). */
export const RECORD_DUE_LIMIT = 3

function targetName(dict: Dictionary, code: string): string {
  return (dict.medicalRecord.targets as Record<string, string>)[code] ?? code
}

function groupsTitle(dict: Dictionary, targets: readonly string[]): string | null {
  const groups = parasiteGroups(targets)
  if (groups.length === 0) return null
  const names = groups.map((group) => dict.medicalRecord.parasiteGroups[group])
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${dict.medicalRecord.and} ${names[names.length - 1]}` : names[0]
  return joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase()
}

/** What a due row is called: the disease, «Блохи и клещи», the visit's kind, the owner's own name. */
export function dueTitle(dict: Dictionary, entry: DueEntry): string {
  const words = dict.medicalRecord
  if (entry.kind === 'visit') {
    const kind = entry.event.visit_kind
    return kind ? words.visits.kinds[kind] : words.due.visit
  }
  const item = entry.item as HealthItem
  if (entry.kind === 'parasite') return groupsTitle(dict, item.targets) ?? item.name ?? words.due.noProduct
  if (item.targets.length === 1) return targetName(dict, item.targets[0])
  if (item.targets.length > 1) return words.due.complexVaccination
  return item.name ?? words.due.noProduct
}

export function dueStatusText(dict: Dictionary, locale: Locale, date: string, today: string): { text: string; tone: DueTone } {
  const words = dict.medicalRecord.due
  const shown = day(dict.medicalRecord, date, today)
  const timing = dueTiming(date, today)
  if (timing.tone === 'later') return { text: shown, tone: 'later' }
  if (timing.tone === 'overdue') {
    if (timing.longOverdue) return { text: words.overdueSince.replace('{day}', shown), tone: 'overdue' }
    const late = -timing.days
    const text = late === 1 ? words.overdueYesterday : formatCount(words.overdueDays, late, locale)
    return { text: `${text} · ${shown}`, tone: 'overdue' }
  }
  const soon = timing.days === 0 ? words.today : timing.days === 1 ? words.tomorrow : formatCount(words.inDays, timing.days, locale)
  return { text: `${soon} · ${shown}`, tone: 'soon' }
}

function dueRow(
  dict: Dictionary,
  locale: Locale,
  overview: HealthOverview,
  entry: DueEntry,
  today: string,
  from: CompleteFrom,
  stage: MedicalRecordStage,
): DueRow {
  const status = dueStatusText(dict, locale, entry.date, today)
  const title = dueTitle(dict, entry)
  const petId = overview.pet.id
  // The site's stage and the server's word (`writable`): an older server gets no «Сделано» that would fail.
  const words = dict.medicalRecord.due
  if (entry.kind === 'visit') {
    // «Состоялся»: the visit's own step, the whole plan (a planned visit has no items).
    const held = heldOpen(stage) && sectionOpen('visits', overview.writable, stage)
    return {
      key: entry.key,
      kind: entry.kind,
      title,
      status: status.text,
      tone: status.tone,
      completeHref: held ? medicalRecordHref.complete(petId, entry.event.id, null, from) : null,
      completeText: words.markHeld,
      completeLabel: words.markHeldLabel.replace('{title}', title).replace('{status}', status.text.toLowerCase()),
    }
  }
  const offered =
    completeOpen(entry.kind, stage) && sectionOpen(entry.kind === 'vaccination' ? 'vaccinations' : 'parasites', overview.writable, stage)
  return {
    key: entry.key,
    kind: entry.kind,
    title,
    status: status.text,
    tone: status.tone,
    completeHref: offered ? medicalRecordHref.complete(petId, entry.event.id, entry.key, from) : null,
    completeText: words.markDone,
    completeLabel: words.markDoneLabel.replace('{title}', title).replace('{status}', status.text.toLowerCase()),
  }
}

/**
 * The record's «Сроки»: the first three, in the shared order — overdue first,
 * then the soonest, then the rest (`dueEntries`, the order `/pets/due` keeps).
 */
export function dueBlock(
  dict: Dictionary,
  locale: Locale,
  overview: HealthOverview,
  today: string,
  stage: MedicalRecordStage = MEDICAL_RECORD_STAGE,
): DueBlock {
  const entries = dueEntries(overview.events)
  return {
    total: entries.length,
    rows: entries.slice(0, RECORD_DUE_LIMIT).map((entry) => dueRow(dict, locale, overview, entry, today, 'medical', stage)),
  }
}

/** «Все сроки»: every due date of the pet, in the same order, each with its «Сделано». */
export function allDue(
  dict: Dictionary,
  locale: Locale,
  overview: HealthOverview,
  today: string,
  stage: MedicalRecordStage = MEDICAL_RECORD_STAGE,
): DueBlock {
  const rows = dueEntries(overview.events).map((entry) => dueRow(dict, locale, overview, entry, today, 'due', stage))
  return { rows, total: rows.length }
}

// ---------- «Важно знать» ----------

export type Fact = { label: string; value: string }

/**
 * Allergies, chronic conditions and what the pet takes now — only what is on
 * file. Medicines come from the courses when there are any, the form's list
 * otherwise; an empty list is "not said" and is left out, never "none".
 */
export function importantFacts(dict: Dictionary, overview: HealthOverview, today: string): Fact[] {
  const words = dict.medicalRecord.important
  const { pet, medications } = overview
  const taking =
    medications.length > 0
      ? splitCourses(medications, today).current.map((course) => (course.ongoing ? `${course.name} · ${words.ongoing}` : course.name))
      : pet.medications
  return [
    { label: words.allergies, value: pet.allergies.join(', ') },
    { label: words.chronic, value: pet.chronic_conditions.join(', ') },
    { label: words.takingNow, value: taking.join(', ') },
  ].filter((fact) => fact.value.trim() !== '')
}

// ---------- Sections ----------

export type SectionLine = { key: string; title: string; detail: string }

export type SectionCard = {
  section: Exclude<HealthSection, 'weight'>
  title: string
  lines: SectionLine[]
  /** Nothing in the record: what the form says, or that nothing was said. */
  empty: SectionLine | null
}

/** Lines per card, as in the design (web v1, «medical»). */
export const SECTION_LINES = 2

function joinDetail(...parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => !!part && part.trim() !== '').join(' · ')
}

/**
 * What an item of a vaccination or a treatment is called in a list: its name;
 * without one, what it was against («Бешенство», «Блохи и клещи»); else
 * «Без препарата».
 */
export function eventItemName(dict: Dictionary, kind: HealthEvent['kind'], item: Pick<HealthItem, 'name' | 'targets'>): string {
  if (kind === 'parasite') return item.name ?? groupsTitle(dict, item.targets) ?? dict.medicalRecord.due.noProduct
  return vaccineName(dict, item)
}

function vaccineName(dict: Dictionary, item: Pick<HealthItem, 'name' | 'targets'>): string {
  if (item.name) return item.name
  if (item.targets.length === 0) return dict.medicalRecord.due.noProduct
  const names = item.targets.map((code) => targetName(dict, code))
  return names.map((name, index) => (index === 0 ? name : name.toLowerCase())).join(', ')
}

function vaccinationsCard(dict: Dictionary, overview: HealthOverview, today: string): SectionCard {
  const words = dict.medicalRecord
  const done = doneEvents(overview.events, 'vaccination').flatMap((event) =>
    event.items.map((item) => ({
      key: item.id,
      title: vaccineName(dict, item),
      // A past vaccination always with its year: «12 марта» alone could be any March.
      detail: joinDetail(formatDay(words, event.date, true), event.clinic),
    })),
  )
  const planned = plannedEvents(overview.events, 'vaccination').flatMap((event) =>
    event.items.map((item) => ({
      key: item.id,
      title: vaccineName(dict, item),
      detail: words.vaccinations.planned.replace('{day}', day(words, event.date, today)),
    })),
  )
  const lines = (done.length > 0 ? done : planned).slice(0, SECTION_LINES)
  const { vaccinated } = overview.pet
  const empty =
    lines.length > 0
      ? null
      : vaccinated === true
        ? { key: 'form', title: words.vaccinations.inFormYes, detail: words.vaccinations.inFormYesNote }
        : vaccinated === false
          ? { key: 'form', title: words.vaccinations.inFormNo, detail: words.vaccinations.emptyNote }
          : { key: 'none', title: words.noRecords, detail: words.vaccinations.emptyNote }
  return { section: 'vaccinations', title: words.sections.vaccinations, lines, empty }
}

function parasitesCard(dict: Dictionary, overview: HealthOverview, today: string): SectionCard {
  const words = dict.medicalRecord
  const groups = (item: HealthItem) => groupsTitle(dict, item.targets)?.toLowerCase() ?? null
  const done = doneEvents(overview.events, 'parasite').flatMap((event) =>
    event.items.map((item) => ({
      key: item.id,
      title: item.name ?? groupsTitle(dict, item.targets) ?? words.due.noProduct,
      detail: joinDetail(day(words, event.date, today), item.name ? groups(item) : null),
    })),
  )
  const planned = plannedEvents(overview.events, 'parasite').flatMap((event) =>
    event.items.map((item) => ({
      key: item.id,
      title: item.name ?? groupsTitle(dict, item.targets) ?? words.due.noProduct,
      detail: words.parasites.planned.replace('{day}', day(words, event.date, today)),
    })),
  )
  const lines = (done.length > 0 ? done : planned).slice(0, SECTION_LINES)
  return {
    section: 'parasites',
    title: words.sections.parasites,
    lines,
    empty: lines.length > 0 ? null : { key: 'none', title: words.noRecords, detail: words.parasites.emptyNote },
  }
}

function visitTitle(dict: Dictionary, event: HealthEvent): string {
  const kinds = dict.medicalRecord.visits.kinds
  const kind = event.visit_kind ? kinds[event.visit_kind] : dict.medicalRecord.due.visit
  if (event.status === 'planned') return event.reason ?? kind
  return event.diagnosis ?? event.reason ?? kind
}

function visitsCard(dict: Dictionary, overview: HealthOverview, today: string): SectionCard {
  const words = dict.medicalRecord
  // The next planned visit first — it is what happens next — then the latest ones that happened.
  const next = plannedEvents(overview.events, 'visit').slice(0, 1).map((event) => ({
    key: event.id,
    title: visitTitle(dict, event),
    detail: words.visits.planned.replace('{day}', day(words, event.date, today)),
  }))
  const done = doneEvents(overview.events, 'visit').map((event) => ({
    key: event.id,
    title: visitTitle(dict, event),
    detail: joinDetail(day(words, event.date, today), event.clinic),
  }))
  const lines = [...next, ...done].slice(0, SECTION_LINES)
  return {
    section: 'visits',
    title: words.sections.visits,
    lines,
    empty: lines.length > 0 ? null : { key: 'none', title: words.noRecords, detail: words.visits.emptyNote },
  }
}

function courseDetail(dict: Dictionary, course: Medication, current: boolean, today: string): string {
  const words = dict.medicalRecord.medications
  const record = dict.medicalRecord
  if (current) {
    if (course.ongoing) return joinDetail(words.current, words.ongoing)
    // Its end is said too, so a course that ends is told from one taken «Постоянно».
    if (course.started_on && course.ended_on) return joinDetail(words.current, formatRange(record, course.started_on, course.ended_on, today))
    if (course.started_on) return joinDetail(words.current, words.since.replace('{day}', day(record, course.started_on, today)))
    // From the form: no start was ever given, and none is invented.
    return joinDetail(words.current, course.source === 'form' ? words.fromForm : null)
  }
  if (course.started_on && course.ended_on) return joinDetail(words.finished, formatRange(record, course.started_on, course.ended_on, today))
  return joinDetail(words.finished, course.ended_on ? day(record, course.ended_on, today) : null)
}

function medicationsCard(dict: Dictionary, overview: HealthOverview, today: string): SectionCard {
  const words = dict.medicalRecord
  const { current, past } = splitCourses(overview.medications, today)
  const courses = [
    ...current.map((course) => ({ key: course.id, title: course.name, detail: courseDetail(dict, course, true, today) })),
    ...past.map((course) => ({ key: course.id, title: course.name, detail: courseDetail(dict, course, false, today) })),
  ]
  // A pet the courses never reached: the form's list, as the owner wrote it.
  const fromForm =
    overview.medications.length === 0
      ? overview.pet.medications.map((name, index) => ({ key: `form-${index}`, title: name, detail: words.medications.fromForm }))
      : []
  const lines = (courses.length > 0 ? courses : fromForm).slice(0, SECTION_LINES)
  return {
    section: 'medications',
    title: words.sections.medications,
    lines,
    empty: lines.length > 0 ? null : { key: 'none', title: words.medications.notSaid, detail: words.medications.emptyNote },
  }
}

/** The four record sections drawn as lists; weight has its own card. */
export function sectionCards(dict: Dictionary, overview: HealthOverview, today: string): SectionCard[] {
  return [
    vaccinationsCard(dict, overview, today),
    parasitesCard(dict, overview, today),
    visitsCard(dict, overview, today),
    medicationsCard(dict, overview, today),
  ]
}

// ---------- Weight ----------

export type WeightPoint = { key: string; day: string; value: number; label: string; dayLabel: string }

export type WeightCard =
  /** Two or more dated points this year: a chart, with the same points as text. */
  | { kind: 'chart'; points: WeightPoint[]; label: string }
  /** One value: the latest weighing, or the form's undated weight. */
  | { kind: 'single'; value: string; note: string }
  | { kind: 'none' }

export function weightCard(dict: Dictionary, overview: HealthOverview, today: string): WeightCard {
  const words = dict.medicalRecord
  const year = weightsInPeriod(overview.weights, 'year', today)
  if (year.length >= 2) {
    const points = year.map((weight) => ({
      key: weight.id,
      day: weight.measured_on,
      value: weight.weight_kg,
      label: formatWeight(words, weight.weight_kg),
      dayLabel: day(words, weight.measured_on, today),
    }))
    const label = words.weightCard.chartLabel
      .replace('{from}', formatDecimal(words, points[0].value))
      .replace('{to}', formatDecimal(words, points[points.length - 1].value))
    return { kind: 'chart', points, label }
  }
  const dated = datedWeights(overview.weights)
  const latest = dated[dated.length - 1]
  if (latest) return { kind: 'single', value: formatWeight(words, latest.weight_kg), note: day(words, latest.measured_on, today) }
  if (overview.pet.weight_kg !== null) {
    return { kind: 'single', value: formatWeight(words, overview.pet.weight_kg), note: words.weightFromForm }
  }
  return { kind: 'none' }
}

// ---------- Chart geometry ----------

export type ChartGeometry = {
  points: Array<WeightPoint & { x: number; y: number }>
  /** Guide lines at round weights, each drawn at exactly the weight its label says. */
  guides: Array<{ y: number; value: number }>
}

/**
 * Where each point and guide goes in a `width` × `height` box — the shared
 * layout of the app's chart (`chartLayout`, axis from 10% below the lightest
 * weight, spec §7.8) and its round guide weights (`chartTicks`).
 */
export function chartGeometry(points: readonly WeightPoint[], width: number, height: number): ChartGeometry {
  const layout = chartLayout(
    points.map((point) => ({ id: point.key, measured_on: point.day, weight_kg: point.value, source: 'record' as const })),
    width,
    height,
  )
  if (!layout) return { points: [], guides: [] }
  return {
    points: points.map((point, index) => ({ ...point, x: layout.points[index].x, y: layout.points[index].y })),
    guides: chartTicks(layout.min, layout.max).map((value) => ({ value, y: chartY(layout, value, height) })),
  }
}
