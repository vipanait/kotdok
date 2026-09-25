import {
  HEALTH_SECTIONS,
  type HealthOverview,
  type Medication,
  type HealthSection,
  type Pet,
  type WeightMeasurement,
} from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { lastTreatment, lastVaccination } from './due'
import { weightTrend } from './weight'
import { isCurrent } from './medications'
import { visitSummary } from './visits'

/**
 * What the medical record screen says, worked out from the overview.
 *
 * Kept apart from the screen so the rules the spec cares most about — an empty
 * list is "not said", never "none"; the form's answers are shown without
 * invented dates — are tested without a simulator.
 */

export type HeaderFacts = {
  /** "Кошка · Сибирская · 3 года": only the parts this pet has. */
  meta: string
  /** Only when the owner said so; "not neutered" and "not said" both show nothing. */
  neutered: string | null
  weight: string | null
  weightNote: string | null
}

/**
 * «Кошка» for a female cat, as the design has it — but never the form's
 * «Сука», and never English's bare "Female" in place of the species.
 */
function speciesWord(t: Dictionary, pet: Pet): string {
  if (pet.sex === null) return t.species[pet.species]
  return t.medicalRecord.animal[pet.species][pet.sex]
}

/** The newest dated measurement; the form's undated value does not count. */
function latestDated(weights: readonly WeightMeasurement[]): (WeightMeasurement & { measured_on: string }) | null {
  const dated = weights.filter((w): w is WeightMeasurement & { measured_on: string } => w.measured_on !== null)
  return dated.reduce<(WeightMeasurement & { measured_on: string }) | null>(
    (latest, w) => (latest === null || w.measured_on > latest.measured_on ? w : latest),
    null,
  )
}

/** «12 сентября» this year, «12 сентября 2025 г.» otherwise. */
function day(t: Dictionary, measuredOn: string, today: string): string {
  return t.day(measuredOn, measuredOn.slice(0, 4) !== today.slice(0, 4))
}

export function headerFacts(t: Dictionary, overview: HealthOverview, today: string): HeaderFacts {
  const { pet, weights } = overview
  const parts = [speciesWord(t, pet)]
  if (pet.breed) parts.push(pet.breed)
  if (pet.age_years !== null) parts.push(t.petAge(pet.age_years))

  const latest = latestDated(weights)
  const weightNote =
    pet.weight_kg === null
      ? null
      : latest === null
        ? t.medicalRecord.fromForm
        : (weightTrend(t, weights, today) ?? day(t, latest.measured_on, today))

  return {
    meta: parts.join(' · '),
    neutered: pet.neutered === true ? t.medicalRecord.neutered[pet.sex ?? 'unknown'] : null,
    weight: pet.weight_kg === null ? null : t.medicalRecord.weight(pet.weight_kg),
    weightNote,
  }
}

export type Fact = { label: string; value: string }

/**
 * «Важно знать»: allergies, chronic conditions, current medicines — only
 * those on file. Medicines from the courses when there are any, «(постоянно)»
 * on the ongoing ones; the form's list otherwise.
 */
export function importantFacts(
  t: Dictionary,
  pet: Pet,
  courses: readonly Medication[] = [],
  today: string = '',
): Fact[] {
  const words = t.medicalRecord
  const current = courses.filter((course) => isCurrent(course, today))
  const medicines =
    courses.length > 0
      ? current.map((course) => (course.ongoing ? `${course.name} (${words.meds.ongoingOnly})` : course.name)).join(', ')
      : pet.medications.join(', ')
  const facts: Fact[] = [
    { label: words.allergies, value: pet.allergies.join(', ') },
    { label: words.chronic, value: pet.chronic_conditions.join(', ') },
    { label: words.takingNow, value: medicines },
  ]
  return facts.filter((fact) => fact.value !== '')
}

/**
 * Sections this build has a screen for. The server's `writable` says what it
 * can store; an app older than the server must not draw a chevron for a
 * section it cannot open. Each stage adds its section here with its screen.
 */
const OPENABLE_SECTIONS: readonly HealthSection[] = ['vaccinations', 'parasites', 'visits', 'medications', 'weight']

export type SectionRow = {
  section: HealthSection
  title: string
  summary: string
  /** A section opens only once its records can be stored; until then it is a summary line. */
  openable: boolean
}

function summary(t: Dictionary, section: HealthSection, overview: HealthOverview, today: string): string {
  const words = t.medicalRecord
  const { pet } = overview
  switch (section) {
    case 'vaccinations': {
      const last = lastVaccination(overview.events)
      if (last) return words.lastVaccination(t.day(last, true))
      if (pet.vaccinated === true) return words.vaccinatedInForm
      if (pet.vaccinated === false) return words.notVaccinatedInForm
      return words.noRecords
    }
    case 'medications': {
      const courses = overview.medications
      if (courses.length === 0) {
        return pet.medications.length > 0 ? words.currentCount(pet.medications.length) : words.noRecords
      }
      return words.meds.summary(courses.filter((course) => isCurrent(course, today)).length, courses.length)
    }
    case 'weight': {
      const latest = latestDated(overview.weights)
      if (latest) return `${words.weight(latest.weight_kg)} · ${day(t, latest.measured_on, today)}`
      return pet.weight_kg === null ? words.noRecords : words.weightFromForm(words.weight(pet.weight_kg))
    }
    case 'parasites': {
      const last = lastTreatment(overview.events)
      return last ? words.lastTreatment(day(t, last, today)) : words.noRecords
    }
    case 'visits':
      return visitSummary(t, overview.events, today) ?? words.noRecords
  }
}

export function sectionRows(t: Dictionary, overview: HealthOverview, today: string): SectionRow[] {
  return HEALTH_SECTIONS.map((section) => ({
    section,
    title: t.medicalRecord.sections[section],
    summary: summary(t, section, overview, today),
    openable: overview.writable.includes(section) && OPENABLE_SECTIONS.includes(section),
  }))
}

/**
 * Whether the record holds anything the check would read (MR-10): a record, a
 * course, a dated weight. The form's own undated weight is not a record.
 */
export function hasRecords(overview: Pick<HealthOverview, 'events' | 'weights' | 'medications'>): boolean {
  return (
    overview.events.length > 0 ||
    overview.medications.length > 0 ||
    overview.weights.some((weight) => weight.measured_on !== null)
  )
}
