import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import { ageText } from './pet-age'

const TODAY = '2026-10-20'

describe('a pet’s age in words (FB-2/05)', () => {
  it('says months under a year when the birth date is known', () => {
    expect(ageText(ru, { birth_date: '2026-09-20', age_years: null }, TODAY)).toBe('1 месяц')
    expect(ageText(ru, { birth_date: '2026-05-01', age_years: null }, TODAY)).toBe('5 месяцев')
    expect(ageText(ru, { birth_date: '2026-10-05', age_years: null }, TODAY)).toBe('меньше месяца')
  })

  it('says years from a year on, and the typed age without a date', () => {
    expect(ageText(ru, { birth_date: '2025-10-20', age_years: null }, TODAY)).toBe('1 год')
    expect(ageText(ru, { birth_date: null, age_years: 4 }, TODAY)).toBe('4 года')
    expect(ageText(ru, { birth_date: null, age_years: null }, TODAY)).toBeNull()
  })
})
