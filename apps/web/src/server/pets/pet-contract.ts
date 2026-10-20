import 'server-only'

import { FEATURES_HEADER, PET_DATES_FEATURE, PET_DATE_FIELDS, PetSchema, type Pet as PetContract } from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'
import type { Pet } from '@/shared/types'

/**
 * Turns a pets row into the published shape.
 *
 * Built field by field rather than spread: the schema is strict, so a column
 * added to the table later cannot start reaching clients by accident, and
 * `user_id` and `deleted_at` never leave the server.
 */
export function toPetContract(row: Pet): PetContract {
  return PetSchema.parse({
    id: row.id,
    species: row.species,
    name: row.name,
    breed: row.breed,
    age_years: row.age_years,
    weight_kg: row.weight_kg,
    sex: row.sex,
    neutered: row.neutered,
    indoor_outdoor: row.indoor_outdoor,
    diet: row.diet,
    size_class: row.size_class,
    walk_activity: row.walk_activity,
    allergies: row.allergies ?? [],
    vaccinated: row.vaccinated,
    chronic_conditions: row.chronic_conditions ?? [],
    medications: row.medications ?? [],
    notes: row.notes,
    birth_date: row.birth_date ?? null,
    birth_date_approx: row.birth_date_approx ?? false,
    adopted_on: row.adopted_on ?? null,
    created_at: toUtcIso(row.created_at),
  })
}

/** Whether the request comes from an app that reads the pet's dates. */
export function readsPetDates(request: Request): boolean {
  return (request.headers.get(FEATURES_HEADER) ?? '')
    .split(',')
    .map((feature) => feature.trim())
    .includes(PET_DATES_FEATURE)
}

/**
 * The pet as this client can read it: without the dates for a build from
 * before them, whose strict schema would refuse the whole response.
 */
export function petFor<T extends Record<string, unknown>>(request: Request, pet: T): T {
  if (readsPetDates(request)) return pet
  const older = { ...pet }
  for (const key of PET_DATE_FIELDS) delete older[key]
  return older
}
