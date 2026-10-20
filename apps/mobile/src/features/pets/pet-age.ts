import { ageInMonths, headAge } from '@lapka/shared'
import type { Dictionary } from '@/i18n'

/**
 * A pet's age as the app says it: in months under a year when the birth
 * date is known — a kitten is «1 месяц», not «0 лет» (FB-2/05) — and in
 * years otherwise, zero included, by the shared rule (`headAge`).
 */
export function ageText(t: Dictionary, pet: { birth_date: string | null; age_years: number | null }, today: string): string | null {
  if (pet.birth_date) {
    const months = ageInMonths(pet.birth_date, today)
    if (months < 12) return months === 0 ? t.petAgeUnderMonth : t.petAgeMonths(months)
  }
  const years = headAge(pet, today)
  return years === null ? null : t.petAge(years)
}
