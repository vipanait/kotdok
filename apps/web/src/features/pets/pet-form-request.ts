import type { Pet, PetSizeClass, PetSpecies, PetWalkActivity } from '@/shared/types'
import type { PetDatesValue } from '@/features/pets/pet-dates-form'

/**
 * The pet form's request, apart from React so its fields are unit tested:
 * the fields as typed, and what the record needs to read them.
 */

/**
 * Every field of the pet, the dates included (FB-2): the form always sends
 * the dates it shows, read by `readPetDates` — untouched, they are the ones
 * the pet has, so a save never clears them. The photo goes its own way.
 */
export type PetFormValues = Omit<Pet, 'id' | 'user_id' | 'created_at' | 'avatar_path'>

/** The form's fields as the owner left them: text as typed, choices as picked. */
export type PetFormFields = {
  species: PetSpecies
  name: string
  breed: string
  /** The «Даты» section as read (`readPetDates`): the birth date, its estimate, the home day and the age. */
  dates: PetDatesValue
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

/**
 * The list a field stands for: the pet's own list while the field shows it
 * untouched — an item may have a comma of its own («рыба, кроме лосося»),
 * which reading the field again would split in two — otherwise the field.
 */
function listOf(field: string, before: string[] | null | undefined): string[] {
  return before && field === fromArr(before) ? [...before] : toArr(field)
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
    age_years: fields.dates.age_years,
    birth_date: fields.dates.birth_date,
    birth_date_approx: fields.dates.birth_date_approx,
    adopted_on: fields.dates.adopted_on,
    weight_kg: parseDecimal(fields.weightKg),
    sex: fields.sex,
    neutered: fields.neutered,
    indoor_outdoor: fields.indoorOutdoor,
    diet: fields.diet,
    size_class: dog ? fields.sizeClass : null,
    walk_activity: dog ? fields.walkActivity : null,
    allergies: listOf(fields.allergies, pet?.allergies),
    vaccinated: fields.vaccinated,
    chronic_conditions: listOf(fields.chronicConditions, pet?.chronic_conditions),
    medications: listOf(fields.medications, pet?.medications),
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
