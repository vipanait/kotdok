import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import type { Pet } from '@/shared/types'
import { headAge, localToday } from '@lapka/shared'

/**
 * "Сибирская · 3 года": whatever of breed and age the profile has, or an
 * empty string. The age follows the one rule of the phone and the record's
 * head (shared `headAge`, MW-09): zero is said too, «0 лет».
 */
export function petSummary(
  pet: Pick<Pet, 'breed' | 'age_years' | 'birth_date'>,
  dict: Dictionary,
  locale: Locale,
  separator = ' · ',
): string {
  const parts: string[] = []
  const breed = pet.breed?.trim()
  if (breed) parts.push(breed)
  // Today on the reader's own calendar: these lines are drawn where they are read.
  const age = headAge(pet, localToday())
  if (age !== null) parts.push(formatCount(dict.pets.age, age, locale))
  return parts.join(separator)
}

/**
 * What the check form says about the chosen pet next to its selection: age,
 * and chronic conditions when the profile lists any. An empty list is not
 * "healthy", only "not filled in", so it is simply left out.
 */
export function petHealthFacts(
  pet: Pick<Pet, 'age_years' | 'birth_date' | 'chronic_conditions'>,
  dict: Dictionary,
  locale: Locale,
): { age: string | null; chronic: string | null } {
  // The same rule as everywhere (shared `headAge`): zero is said.
  const years = headAge(pet, localToday())
  const age = years !== null ? formatCount(dict.pets.age, years, locale) : null
  const conditions = (pet.chronic_conditions ?? []).map(c => c.trim()).filter(Boolean)
  const chronic = conditions.length ? dict.check.petChronic.replace('{list}', () => conditions.join(', ')) : null
  return { age, chronic }
}
