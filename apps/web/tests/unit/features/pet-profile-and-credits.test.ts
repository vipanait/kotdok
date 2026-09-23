import { describe, expect, it } from 'vitest'
import { canRequestExtraCheck, creditsState } from '@/features/credits/credits-state'
import { profileCompleteness } from '@/features/pets/pet-profile'
import { formatCount } from '@/shared/i18n/plural'

const ruAge = { one: '{n} год', few: '{n} года', many: '{n} лет', other: '{n} года' }
const enAge = { one: '{n} year', few: '{n} years', many: '{n} years', other: '{n} years' }

const empty = {
  species: 'cat' as const,
  breed: null,
  age_years: null,
  weight_kg: null,
  sex: null,
  neutered: null,
  vaccinated: null,
  indoor_outdoor: null,
  diet: null,
  size_class: null,
  walk_activity: null,
}

describe('profileCompleteness', () => {
  it('is 0 for a pet with only a name', () => {
    expect(profileCompleteness(empty)).toBe(0)
  })

  it('counts false answers as filled in', () => {
    const cat = {
      ...empty,
      breed: 'Сибирская',
      age_years: 3,
      weight_kg: 4.5,
      sex: 'female' as const,
      neutered: false,
      vaccinated: false,
      indoor_outdoor: 'indoor' as const,
      diet: 'dry' as const,
    }
    expect(profileCompleteness(cat)).toBe(100)
  })

  it('asks a dog for size and walks too', () => {
    const dog = {
      ...empty,
      species: 'dog' as const,
      breed: 'Лабрадор',
      age_years: 5,
      weight_kg: 18,
      sex: 'male' as const,
      neutered: true,
      vaccinated: true,
      indoor_outdoor: 'both' as const,
      diet: 'mixed' as const,
    }
    expect(profileCompleteness(dog)).toBe(80)
    expect(profileCompleteness({ ...dog, size_class: 'large', walk_activity: 'daily_long' })).toBe(100)
  })

  it('does not count a blank breed', () => {
    expect(profileCompleteness({ ...empty, breed: '  ' })).toBe(0)
  })
})

describe('formatCount for ages', () => {
  it('uses Russian plural forms and a decimal comma', () => {
    expect(formatCount(ruAge, 1, 'ru')).toBe('1 год')
    expect(formatCount(ruAge, 3, 'ru')).toBe('3 года')
    expect(formatCount(ruAge, 5, 'ru')).toBe('5 лет')
    expect(formatCount(ruAge, 21, 'ru')).toBe('21 год')
    expect(formatCount(ruAge, 4.5, 'ru')).toBe('4,5 года')
  })

  it('uses English plural forms', () => {
    expect(formatCount(enAge, 1, 'en')).toBe('1 year')
    expect(formatCount(enAge, 2.5, 'en')).toBe('2.5 years')
  })
})

describe('creditsState', () => {
  it('is ready with a balance, whatever the last request', () => {
    expect(creditsState(2, null)).toBe('ready')
    expect(creditsState(1, 'approved')).toBe('ready')
    expect(creditsState(1, 'pending')).toBe('ready')
  })

  it('tells an empty balance apart by the last request', () => {
    expect(creditsState(0, null)).toBe('out')
    expect(creditsState(0, 'approved')).toBe('out')
    expect(creditsState(0, 'pending')).toBe('pending')
    expect(creditsState(0, 'rejected')).toBe('rejected')
  })

  it('allows a request only with an empty balance and nothing pending', () => {
    expect(canRequestExtraCheck(0, null)).toBe(true)
    expect(canRequestExtraCheck(0, 'rejected')).toBe(true)
    expect(canRequestExtraCheck(0, 'approved')).toBe(true)
    expect(canRequestExtraCheck(0, 'pending')).toBe(false)
    expect(canRequestExtraCheck(1, null)).toBe(false)
  })
})
