import {
  HEALTH_SECTIONS,
  type HealthOverview,
  type Medication,
  type HealthSection,
  type Pet,
  type WeightMeasurement,
} from '@lapka/contracts'
import { headFactsData, importantFactsData, isCurrentCourse, lastDoneDate } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { ageText } from '@/features/pets/pet-age'
import { trendWords } from './weight'
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
export function speciesWord(t: Dictionary, pet: Pick<Pet, 'species' | 'sex'>): string {
  return t.medicalRecord.animal[pet.species][pet.sex ?? 'unknown']
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
  const { pet } = overview
  // What the head is made of is the shared rule (`headFactsData`), the site's too.
  const data = headFactsData(overview, today)
  const parts = [speciesWord(t, data)]
  if (data.breed) parts.push(data.breed)
  // The shared rule: zero is said too («0 лет»), as on the site (MW-09).
  const age = ageText(t, pet, today)
  if (age !== null) parts.push(age)

  const note = data.weightNote
  return {
    meta: parts.join(' · '),
    neutered: data.neutered ? t.medicalRecord.neutered[data.sex ?? 'unknown'] : null,
    weight: pet.weight_kg === null ? null : t.medicalRecord.weight(pet.weight_kg),
    weightNote:
      note === null ? null : note.kind === 'fromForm' ? t.medicalRecord.fromForm : note.kind === 'trend' ? trendWords(t, note.trend) : t.day(note.day.day, note.day.withYear),
  }
}

export type Fact = { label: string; value: string }

/**
 * «Важно знать»: allergies, chronic conditions, current medicines — only
 * those on file. Medicines from the courses when there are any — those being
 * given now (`isTakenNow`: a course that starts later is not taken yet, the
 * same rule as the summary for the vet), «(постоянно)» on the ongoing ones;
 * the form's list otherwise.
 */
/**
 * Between the items of a list the owner typed: «; », since an item may have
 * a comma of its own — «рыба, кроме лосося» is one allergy, not two.
 */
export const LIST_SEPARATOR = '; '

export function importantFacts(
  t: Dictionary,
  pet: Pet,
  courses: readonly Medication[] = [],
  today: string = '',
): Fact[] {
  const words = t.medicalRecord
  // Which medicines count as taken now is the shared rule (`importantFactsData`), the site's too.
  const data = importantFactsData({ pet, medications: courses }, today)
  const medicines = data.taking.map((course) => (course.ongoing ? `${course.name} (${words.meds.ongoingOnly})` : course.name)).join(LIST_SEPARATOR)
  const facts: Fact[] = [
    { label: words.allergies, value: data.allergies.join(LIST_SEPARATOR) },
    { label: words.chronic, value: data.chronic.join(LIST_SEPARATOR) },
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
      const last = lastDoneDate(overview.events, 'vaccination')
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
      return words.meds.summary(courses.filter((course) => isCurrentCourse(course, today)).length, courses.length)
    }
    case 'weight': {
      const latest = latestDated(overview.weights)
      if (latest) return `${words.weight(latest.weight_kg)} · ${day(t, latest.measured_on, today)}`
      return pet.weight_kg === null ? words.noRecords : words.weightFromForm(words.weight(pet.weight_kg))
    }
    case 'parasites': {
      const last = lastDoneDate(overview.events, 'parasite')
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

