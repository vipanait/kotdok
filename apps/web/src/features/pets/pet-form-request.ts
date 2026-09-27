import type { Pet, PetSizeClass, PetSpecies, PetWalkActivity } from '@/shared/types'

/**
 * The pet form's request, apart from React so its fields are unit tested:
 * the fields as typed, and what the record needs to read them.
 */

export type PetFormValues = Omit<Pet, 'id' | 'user_id' | 'created_at'>

/** The form's fields as the owner left them: text as typed, choices as picked. */
export type PetFormFields = {
  species: PetSpecies
  name: string
  breed: string
  ageYears: string
  weightKg: string
  sex: Pet['sex']
  neutered: boolean | null
  indoorOutdoor: Pet['indoor_outdoor']
  diet: Pet['diet']
  sizeClass: PetSizeClass | null
  walkActivity: PetWalkActivity | null
  /** Comma-separated, as in the field. */
  allergies: string
  vaccinated: boolean | null
  chronicConditions: string
  medications: string
  notes: string
}

/** A comma-separated field as a list: «Курица, говядина» → two items, empties dropped. */
export function toArr(val: string): string[] {
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

/** A list as the comma-separated field shows it. */
export function fromArr(arr: string[]): string {
  return arr.join(', ')
}

/** «4,2» or «4.2» as a number; empty or unreadable is none. */
export function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/**
 * The request «Сохранить» sends: POST /api/pets for a new pet, PUT
 * /api/pets/<id> for an edit. With the fields, what the record needs to read
 * the form the way the phone's form is read (pet-service): the owner's own
 * day for a weight or a medicine the form adds or removes — not the server's
 * UTC one — and, on an edit, the weight and the list as the form was opened
 * (an older pet's missing list is the empty one the form shows), so saving
 * an untouched weight is not a new measurement and a course added meanwhile
 * elsewhere is not ended.
 */
export function petFormRequest(
  pet: Pet | undefined,
  fields: PetFormFields,
  today: string,
): { url: string; method: 'POST' | 'PUT'; body: PetFormValues & Record<string, unknown> } {
  const dog = fields.species === 'dog'
  const values: PetFormValues = {
    species: fields.species,
    name: fields.name.trim(),
    breed: fields.breed.trim() || null,
    age_years: parseDecimal(fields.ageYears),
    weight_kg: parseDecimal(fields.weightKg),
    sex: fields.sex,
    neutered: fields.neutered,
    indoor_outdoor: fields.indoorOutdoor,
    diet: fields.diet,
    size_class: dog ? fields.sizeClass : null,
    walk_activity: dog ? fields.walkActivity : null,
    allergies: toArr(fields.allergies),
    vaccinated: fields.vaccinated,
    chronic_conditions: toArr(fields.chronicConditions),
    medications: toArr(fields.medications),
    notes: fields.notes.trim() || null,
  }
  const recordContext = {
    weight_measured_on: today,
    ...(pet ? { weight_kg_before: pet.weight_kg, medications_before: pet.medications ?? [] } : {}),
  }
  return pet
    ? { url: `/api/pets/${pet.id}`, method: 'PUT', body: { ...values, ...recordContext } }
    : { url: '/api/pets', method: 'POST', body: { ...values, ...recordContext } }
}
