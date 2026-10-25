import type { HealthEvent, Medication, ParasiteGroup, Pet, VisitKind, WeightMeasurement } from '@lapka/contracts'
import { daysTogether } from '../pets/pet-dates'
import { datedWeights, dueTiming, headAge, isTakenNow, parasiteGroups, splitCourses, weightTrend, type WeightTrend } from './record-overview'

/**
 * What the medical record says, as parts: which day, how many days, which
 * disease, which groups — worked out once for the site and the phone. Each
 * app puts the parts into its own words (`view-model.ts` there, `due.ts`,
 * `overview.ts` here); the rule behind the words is this file's, so the two
 * cannot drift apart again as they had (a newborn's «0,1 кг» on the site
 * next to «85 г» on the phone; a course that starts later named on one and
 * not the other).
 */

// ---------- Days ----------

/** A calendar day, and whether the year is worth writing (another year than today's). */
export type DayRef = { day: string; withYear: boolean }

export function dayRef(day: string, today: string): DayRef {
  return { day, withYear: day.slice(0, 4) !== today.slice(0, 4) }
}

// ---------- Due dates ----------

export type DueStatusParts =
  /** Past the fourteen "soon" days: the date alone says it. */
  | { tone: 'later'; day: DayRef }
  | { tone: 'soon'; day: DayRef; when: { kind: 'today' } | { kind: 'tomorrow' } | { kind: 'inDays'; days: number } }
  /** `long`: overdue by more than two months, where a count stops meaning anything. */
  | { tone: 'overdue'; day: DayRef; since: { kind: 'yesterday' } | { kind: 'days'; days: number } | { kind: 'long' } }

export function dueStatusParts(date: string, today: string): DueStatusParts {
  const day = dayRef(date, today)
  const timing = dueTiming(date, today)
  if (timing.tone === 'later') return { tone: 'later', day }
  if (timing.tone === 'overdue') {
    if (timing.longOverdue) return { tone: 'overdue', day, since: { kind: 'long' } }
    const late = -timing.days
    return { tone: 'overdue', day, since: late === 1 ? { kind: 'yesterday' } : { kind: 'days', days: late } }
  }
  return { tone: 'soon', day, when: timing.days === 0 ? { kind: 'today' } : timing.days === 1 ? { kind: 'tomorrow' } : { kind: 'inDays', days: timing.days } }
}

/** What a due row is called: the visit's kind, the parasite groups, the one disease, or the owner's own name. */
export type DueTitleParts =
  | { kind: 'visit'; visitKind: VisitKind | null }
  | { kind: 'parasiteGroups'; groups: ParasiteGroup[] }
  | { kind: 'target'; target: string }
  | { kind: 'complexVaccination' }
  | { kind: 'name'; name: string }
  | { kind: 'noProduct' }

/** An item as either app holds it: the name, and what it was against. */
export type ItemLike = { name: string | null; targets: readonly string[] }

export function dueTitleParts(kind: HealthEvent['kind'], item: ItemLike | null, visitKind: HealthEvent['visit_kind']): DueTitleParts {
  if (kind === 'visit' || item === null) return { kind: 'visit', visitKind: visitKind ?? null }
  if (kind === 'parasite') {
    const groups = parasiteGroups(item.targets)
    if (groups.length > 0) return { kind: 'parasiteGroups', groups }
    return item.name ? { kind: 'name', name: item.name } : { kind: 'noProduct' }
  }
  if (item.targets.length === 1) return { kind: 'target', target: item.targets[0] }
  if (item.targets.length > 1) return { kind: 'complexVaccination' }
  return item.name ? { kind: 'name', name: item.name } : { kind: 'noProduct' }
}

/** What an item of a record is called in a list: its name; without one, what it was against. */
export type ItemNameParts =
  | { kind: 'name'; name: string }
  | { kind: 'targets'; targets: string[] }
  | { kind: 'parasiteGroups'; groups: ParasiteGroup[] }
  | { kind: 'noProduct' }

export function itemNameParts(kind: HealthEvent['kind'], item: ItemLike): ItemNameParts {
  if (item.name) return { kind: 'name', name: item.name }
  if (kind === 'parasite') {
    const groups = parasiteGroups(item.targets)
    return groups.length > 0 ? { kind: 'parasiteGroups', groups } : { kind: 'noProduct' }
  }
  return item.targets.length > 0 ? { kind: 'targets', targets: [...item.targets] } : { kind: 'noProduct' }
}

// ---------- Weight ----------

/** Under a kilogram in whole grams (a newborn is «85 г», not «0,1 кг», FB-2/05); otherwise to a tenth of a kilogram. */
export type WeightParts = { unit: 'g'; grams: number } | { unit: 'kg'; kg: number }

export function weightParts(kg: number): WeightParts {
  if (kg < 1) return { unit: 'g', grams: Math.round(kg * 1000) }
  return { unit: 'kg', kg: Math.round(kg * 10) / 10 }
}

export type TrendParts = {
  /** Kilograms to a tenth; negative when the pet got lighter, 0 for no change. */
  change: number
  span: { kind: 'months'; n: number } | { kind: 'days'; n: number }
}

export function trendParts(trend: WeightTrend): TrendParts {
  return {
    change: Math.round(trend.change * 10) / 10,
    span: trend.months >= 1 ? { kind: 'months', n: trend.months } : { kind: 'days', n: trend.days },
  }
}

// ---------- Head ----------

export type HeadFactsData = {
  name: string
  species: Pet['species']
  sex: Pet['sex']
  breed: string | null
  /** Zero included: «0 лет» is said; null when the form has neither a birth date nor an age. */
  ageYears: number | null
  /** Only when the owner said so; "not" and "not said" are both false. */
  neutered: boolean
  weight: WeightParts | null
  /** The trend, the day of the one weighing, or that the form's weight has no date; null without a weight. */
  weightNote: { kind: 'trend'; trend: TrendParts } | { kind: 'day'; day: DayRef } | { kind: 'fromForm' } | null
  /** Days since the home day, that day counting as one; null without it or on the day itself. */
  togetherDays: number | null
}

export function headFactsData(overview: { pet: Pet; weights: readonly WeightMeasurement[] }, today: string): HeadFactsData {
  const { pet } = overview
  const breed = pet.breed?.trim() || null
  let weightNote: HeadFactsData['weightNote'] = null
  if (pet.weight_kg !== null) {
    const dated = datedWeights(overview.weights)
    const latest = dated[dated.length - 1]
    if (!latest) weightNote = { kind: 'fromForm' }
    else {
      const trend = weightTrend(overview.weights, today)
      weightNote = trend ? { kind: 'trend', trend: trendParts(trend) } : { kind: 'day', day: dayRef(latest.measured_on, today) }
    }
  }
  const together = daysTogether(pet.adopted_on, today)
  return {
    name: pet.name,
    species: pet.species,
    sex: pet.sex,
    breed,
    ageYears: headAge(pet, today),
    neutered: pet.neutered === true,
    weight: pet.weight_kg === null ? null : weightParts(pet.weight_kg),
    weightNote,
    togetherDays: together !== null && together > 0 ? together : null,
  }
}

// ---------- «Важно знать» ----------

export type ImportantFactsData = {
  allergies: string[]
  chronic: string[]
  /** The courses given now (`isTakenNow`) when there are courses; the form's list otherwise. */
  taking: { name: string; ongoing: boolean }[]
}

export function importantFactsData(overview: { pet: Pet; medications: readonly Medication[] }, today: string): ImportantFactsData {
  const { pet, medications } = overview
  const taking =
    medications.length > 0
      ? splitCourses(medications, today)
          .current.filter((course) => isTakenNow(course, today))
          .map((course) => ({ name: course.name, ongoing: course.ongoing }))
      : pet.medications.map((name) => ({ name, ongoing: false }))
  return { allergies: [...pet.allergies], chronic: [...pet.chronic_conditions], taking }
}

// ---------- Courses ----------

export type CoursePeriodParts =
  /** «2–15 августа», «28 июля – 15 августа»: `sameMonth` lets a language write the month once. */
  | { kind: 'range'; from: DayRef; to: DayRef; sameMonth: boolean }
  /** A one-day course: its day, once. */
  | { kind: 'day'; day: DayRef }
  /** Not started yet, and not an ongoing one: «Начнётся 3 октября». */
  | { kind: 'startsLater'; day: DayRef }
  | { kind: 'since'; day: DayRef; ongoing: boolean }
  | { kind: 'until'; day: DayRef }
  | { kind: 'ongoing' }
  /** From the pet form with nothing known: no date is made up. */
  | { kind: 'fromForm' }
  | { kind: 'noDates' }

export function coursePeriodParts(course: Pick<Medication, 'started_on' | 'ended_on' | 'ongoing' | 'source' | 'dosage'>, today: string): CoursePeriodParts {
  const { started_on: start, ended_on: end } = course
  if (start && end) {
    if (start === end) return { kind: 'day', day: dayRef(start, today) }
    const withYear = start.slice(0, 4) !== end.slice(0, 4) || end.slice(0, 4) !== today.slice(0, 4)
    return { kind: 'range', from: { day: start, withYear }, to: { day: end, withYear }, sameMonth: start.slice(0, 7) === end.slice(0, 7) }
  }
  if (start) {
    if (start > today && !course.ongoing) return { kind: 'startsLater', day: dayRef(start, today) }
    return { kind: 'since', day: dayRef(start, today), ongoing: course.ongoing }
  }
  if (end) return { kind: 'until', day: dayRef(end, today) }
  if (course.ongoing) return { kind: 'ongoing' }
  return course.source === 'form' && !course.dosage ? { kind: 'fromForm' } : { kind: 'noDates' }
}
