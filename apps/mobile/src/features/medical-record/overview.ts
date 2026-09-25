import { HEALTH_SECTIONS, type HealthOverview, type HealthSection, type Pet } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'

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

function speciesWord(t: Dictionary, pet: Pet): string {
  if (pet.sex === null) return t.species[pet.species]
  return pet.species === 'cat' ? t.sexCat[pet.sex] : t.sexDog[pet.sex]
}

export function headerFacts(t: Dictionary, pet: Pet): HeaderFacts {
  const parts = [speciesWord(t, pet)]
  if (pet.breed) parts.push(pet.breed)
  if (pet.age_years !== null) parts.push(t.petAge(pet.age_years))

  return {
    meta: parts.join(' · '),
    neutered: pet.neutered === true ? t.medicalRecord.neutered[pet.sex ?? 'unknown'] : null,
    weight: pet.weight_kg === null ? null : t.medicalRecord.weight(pet.weight_kg),
    weightNote: pet.weight_kg === null ? null : t.medicalRecord.fromForm,
  }
}

export type Fact = { label: string; value: string }

/** «Важно знать»: allergies, chronic conditions, current medicines — only those on file. */
export function importantFacts(t: Dictionary, pet: Pet): Fact[] {
  const words = t.medicalRecord
  const facts: Fact[] = [
    { label: words.allergies, value: pet.allergies.join(', ') },
    { label: words.chronic, value: pet.chronic_conditions.join(', ') },
    { label: words.takingNow, value: pet.medications.join(', ') },
  ]
  return facts.filter((fact) => fact.value !== '')
}

export type SectionRow = {
  section: HealthSection
  title: string
  summary: string
  /** A section opens only once its records can be stored; until then it is a summary line. */
  openable: boolean
}

function summary(t: Dictionary, section: HealthSection, pet: Pet): string {
  const words = t.medicalRecord
  switch (section) {
    case 'vaccinations':
      if (pet.vaccinated === true) return words.vaccinatedInForm
      if (pet.vaccinated === false) return words.notVaccinatedInForm
      return words.noRecords
    case 'medications':
      return pet.medications.length > 0 ? words.currentCount(pet.medications.length) : words.noRecords
    case 'weight':
      return pet.weight_kg === null ? words.noRecords : words.weightFromForm(words.weight(pet.weight_kg))
    case 'parasites':
    case 'visits':
      return words.noRecords
  }
}

export function sectionRows(t: Dictionary, overview: HealthOverview): SectionRow[] {
  return HEALTH_SECTIONS.map((section) => ({
    section,
    title: t.medicalRecord.sections[section],
    summary: summary(t, section, overview.pet),
    openable: overview.writable.includes(section),
  }))
}
