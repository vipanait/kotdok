import type { Pet } from '@/shared/types'

type ProfileFacts = Pick<
  Pet,
  | 'species'
  | 'breed'
  | 'age_years'
  | 'weight_kg'
  | 'sex'
  | 'neutered'
  | 'vaccinated'
  | 'indoor_outdoor'
  | 'diet'
  | 'size_class'
  | 'walk_activity'
>

/**
 * How much of the profile is filled in, 0–100.
 *
 * Counts the facts that have a "not specified" state: breed, age, weight, sex,
 * neutering, vaccination, housing and diet, plus size and walks for a dog.
 * Allergies, chronic conditions, medications and notes are left out on
 * purpose: an empty list there is a normal answer ("none"), not a gap.
 */
export function profileCompleteness(pet: ProfileFacts): number {
  const facts: unknown[] = [
    pet.breed?.trim() || null,
    pet.age_years,
    pet.weight_kg,
    pet.sex,
    pet.neutered,
    pet.vaccinated,
    pet.indoor_outdoor,
    pet.diet,
  ]
  if (pet.species === 'dog') facts.push(pet.size_class, pet.walk_activity)

  const filled = facts.filter(value => value !== null && value !== undefined).length
  return Math.round((filled / facts.length) * 100)
}
