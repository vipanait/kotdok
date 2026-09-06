import 'server-only'

import { PetSchema, type Pet as PetContract } from '@lapka/contracts'
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
    created_at: toUtcIso(row.created_at),
  })
}
