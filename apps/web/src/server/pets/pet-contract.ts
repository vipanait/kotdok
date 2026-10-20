import 'server-only'

import { FEATURES_HEADER, PET_AVATAR_FEATURE, PET_DATES_FEATURE, PET_DATE_FIELDS, PetSchema, type Pet as PetContract } from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'
import type { Pet } from '@/shared/types'
import type { createServiceClient } from '@/server/supabase/server'
import { signAvatars } from '@/server/pets/avatar-service'

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
    // Signed per request by `presentPets`; the stored path never leaves.
    avatar_url: null,
    created_at: toUtcIso(row.created_at),
  })
}

/** Whether the request names a feature in `X-Lapka-Features`. */
export function reads(request: Request, feature: string): boolean {
  return (request.headers.get(FEATURES_HEADER) ?? '')
    .split(',')
    .map((name) => name.trim())
    .includes(feature)
}

/** Whether the request comes from an app that reads the pet's dates. */
export function readsPetDates(request: Request): boolean {
  return reads(request, PET_DATES_FEATURE)
}

/**
 * The pet as this client can read it: without the dates, or the photo, for a
 * build from before them, whose strict schema would refuse the whole response.
 */
export function petFor<T extends Record<string, unknown>>(request: Request, pet: T): T {
  const older = { ...pet }
  if (!readsPetDates(request)) for (const key of PET_DATE_FIELDS) delete older[key]
  if (!reads(request, PET_AVATAR_FEATURE)) delete older.avatar_url
  return older
}

type SupabaseService = ReturnType<typeof createServiceClient>

/** Pets as this client reads them, each photo as a short-lived signed link (FB-4). */
export async function presentPets(request: Request, supabase: SupabaseService, rows: readonly Pet[]): Promise<PetContract[]> {
  const pets = rows.map(toPetContract)
  if (reads(request, PET_AVATAR_FEATURE)) {
    const urls = await signAvatars(supabase, rows.map((row) => row.avatar_path ?? null))
    pets.forEach((pet, index) => {
      pet.avatar_url = urls[index]
    })
  }
  return pets.map((pet) => petFor(request, pet))
}

/** A pet already in the published shape (the record, the summary) with its photo signed. */
export async function presentPet<T extends PetContract>(request: Request, supabase: SupabaseService, pet: T, userId: string): Promise<T> {
  if (!reads(request, PET_AVATAR_FEATURE)) return petFor(request, pet)
  const { data } = await supabase.from('pets').select('avatar_path').eq('id', pet.id).eq('user_id', userId).maybeSingle()
  const [url] = await signAvatars(supabase, [(data?.avatar_path as string | null) ?? null])
  return petFor(request, { ...pet, avatar_url: url })
}
