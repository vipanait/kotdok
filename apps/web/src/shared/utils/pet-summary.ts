import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import type { Pet } from '@/shared/types'

/**
 * "Сибирская · 3 года": whatever of breed and age the profile has, or an
 * empty string. An age of 0 is an unfilled field, not a newborn, so it is left out.
 */
export function petSummary(
  pet: Pick<Pet, 'breed' | 'age_years'>,
  dict: Dictionary,
  locale: Locale,
  separator = ' · ',
): string {
  const parts: string[] = []
  const breed = pet.breed?.trim()
  if (breed) parts.push(breed)
  if (pet.age_years != null && pet.age_years > 0) parts.push(formatCount(dict.pets.age, pet.age_years, locale))
  return parts.join(separator)
}
