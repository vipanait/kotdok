import { afterEach, describe, expect, it, vi } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import { petHealthFacts, petSummary } from '@/shared/utils/pet-summary'

describe('the pet list and the check form say the age like the record’s head (shared headAge, MW-09)', () => {
  it('says 0 as «0 лет», and nothing when no age was given', () => {
    expect(petSummary({ breed: 'Сибирская', age_years: 0, birth_date: null }, ru, 'ru')).toBe('Сибирская · 0 лет')
    expect(petSummary({ breed: null, age_years: null, birth_date: null }, ru, 'ru')).toBe('')
    expect(petHealthFacts({ age_years: 0, birth_date: null, chronic_conditions: [] }, ru, 'ru')).toEqual({ age: '0 лет', chronic: null })
    expect(petHealthFacts({ age_years: null, birth_date: null, chronic_conditions: [] }, ru, 'ru').age).toBeNull()
  })
})

describe('an age from the birth date the app saved (FB-2/01)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is counted on the reader’s day, not the typed age', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20, 12))
    expect(petSummary({ breed: null, age_years: 9, birth_date: '2022-04-20' }, ru, 'ru')).toBe('4 года')
  })
})
