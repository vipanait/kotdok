/**
 * Turning what a person typed into what the contract accepts.
 *
 * Kept apart from the screen so it can be tested: every rule here is one the
 * server will otherwise enforce with a 400 the user has to guess at. The form
 * holds strings because that is what a text field gives you; this module is
 * where they become numbers, lists and nulls — or a named complaint.
 */

import {
  PET_DIETS,
  PET_LIFESTYLES,
  PET_SEXES,
  PET_SIZE_CLASSES,
  PET_SPECIES,
  PET_WALK_ACTIVITIES,
  type Pet,
  type PetCreateInput,
} from '@lapka/contracts'

export type Species = (typeof PET_SPECIES)[number]

/** What the screen holds: text as typed, choices as the value or null. */
export type PetForm = {
  species: Species
  name: string
  breed: string
  ageYears: string
  weightKg: string
  sex: (typeof PET_SEXES)[number] | null
  neutered: boolean | null
  indoorOutdoor: (typeof PET_LIFESTYLES)[number] | null
  diet: (typeof PET_DIETS)[number] | null
  sizeClass: (typeof PET_SIZE_CLASSES)[number] | null
  walkActivity: (typeof PET_WALK_ACTIVITIES)[number] | null
  allergies: string
  vaccinated: boolean | null
  chronicConditions: string
  medications: string
  notes: string
}

export const emptyPetForm = (species: Species = 'cat'): PetForm => ({
  species,
  name: '',
  breed: '',
  ageYears: '',
  weightKg: '',
  sex: null,
  neutered: null,
  indoorOutdoor: null,
  diet: null,
  sizeClass: null,
  walkActivity: null,
  allergies: '',
  vaccinated: null,
  chronicConditions: '',
  medications: '',
  notes: '',
})

export function petToForm(pet: Pet): PetForm {
  return {
    species: pet.species,
    name: pet.name,
    breed: pet.breed ?? '',
    ageYears: pet.age_years === null ? '' : String(pet.age_years),
    weightKg: pet.weight_kg === null ? '' : String(pet.weight_kg),
    sex: pet.sex,
    neutered: pet.neutered,
    indoorOutdoor: pet.indoor_outdoor,
    diet: pet.diet,
    sizeClass: pet.size_class,
    walkActivity: pet.walk_activity,
    allergies: formatList(pet.allergies),
    vaccinated: pet.vaccinated,
    chronicConditions: formatList(pet.chronic_conditions),
    medications: formatList(pet.medications),
    notes: pet.notes ?? '',
  }
}

/** Lists are typed as one line, the way the site asks for them. */
export function formatList(items: readonly string[]): string {
  return items.join(', ')
}

export const LIST_MAX_ITEMS = 20

export function parseList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, LIST_MAX_ITEMS)
}

export type NumberResult = { ok: true; value: number | null } | { ok: false }

/**
 * An empty field means "not stated", not zero — the contract distinguishes
 * them, and a pet with no weight recorded is not a pet weighing nothing.
 */
export function parseOptionalNumber(text: string, max: number): NumberResult {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return { ok: true, value: null }

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0 || value > max) return { ok: false }
  return { ok: true, value }
}

export const AGE_MAX = 50
export const WEIGHT_MAX = 200

export type FormResult =
  | { ok: true; value: PetCreateInput }
  | { ok: false; field: keyof PetForm; message: string }

/**
 * @returns what to send, or the first field to complain about.
 *
 * Dog-only fields are dropped for a cat rather than sent and refused: the
 * contract rejects them outright, and a person who once filled them in for a
 * dog should not be blocked by a value they can no longer see.
 */
export function formToInput(form: PetForm): FormResult {
  const name = form.name.trim()
  if (name === '') return { ok: false, field: 'name', message: 'Введите имя питомца' }

  const age = parseOptionalNumber(form.ageYears, AGE_MAX)
  if (!age.ok) {
    return { ok: false, field: 'ageYears', message: `Возраст — число от 0 до ${AGE_MAX}` }
  }

  const weight = parseOptionalNumber(form.weightKg, WEIGHT_MAX)
  if (!weight.ok) {
    return { ok: false, field: 'weightKg', message: `Вес — число от 0 до ${WEIGHT_MAX}` }
  }

  const isDog = form.species === 'dog'

  return {
    ok: true,
    value: {
      species: form.species,
      name,
      breed: form.breed.trim() || null,
      age_years: age.value,
      weight_kg: weight.value,
      sex: form.sex,
      neutered: form.neutered,
      indoor_outdoor: form.indoorOutdoor,
      diet: form.diet,
      size_class: isDog ? form.sizeClass : null,
      walk_activity: isDog ? form.walkActivity : null,
      allergies: parseList(form.allergies),
      vaccinated: form.vaccinated,
      chronic_conditions: parseList(form.chronicConditions),
      medications: parseList(form.medications),
      notes: form.notes.trim() || null,
    },
  }
}
