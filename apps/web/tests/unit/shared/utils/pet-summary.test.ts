import { describe, expect, it } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import { petHealthFacts, petSummary } from '@/shared/utils/pet-summary'

describe('the pet list and the check form say the age like the record’s head (shared headAge, MW-09)', () => {
  it('says 0 as «0 лет», and nothing when no age was given', () => {
    expect(petSummary({ breed: 'Сибирская', age_years: 0 }, ru, 'ru')).toBe('Сибирская · 0 лет')
    expect(petSummary({ breed: null, age_years: null }, ru, 'ru')).toBe('')
    expect(petHealthFacts({ age_years: 0, chronic_conditions: [] }, ru, 'ru')).toEqual({ age: '0 лет', chronic: null })
    expect(petHealthFacts({ age_years: null, chronic_conditions: [] }, ru, 'ru').age).toBeNull()
  })
})
