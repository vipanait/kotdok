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

/**
 * What the check form says about the chosen pet next to its selection: age,
 * and chronic conditions when the profile lists any. An empty list is not
 * "healthy", only "not filled in", so it is simply left out.
 */
export function petHealthFacts(
  pet: Pick<Pet, 'age_years' | 'chronic_conditions'>,
  dict: Dictionary,
  locale: Locale,
): { age: string | null; chronic: string | null } {
  const age = pet.age_years != null && pet.age_years > 0 ? formatCount(dict.pets.age, pet.age_years, locale) : null
  const conditions = (pet.chronic_conditions ?? []).map(c => c.trim()).filter(Boolean)
  const chronic = conditions.length ? dict.check.petChronic.replace('{list}', () => conditions.join(', ')) : null
  return { age, chronic }
}
