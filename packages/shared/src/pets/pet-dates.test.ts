import { describe, expect, it } from 'vitest'
import { headAge } from '../medical-record/record-overview'
import { approxBirthDate, daysTogether, isBirthday, petAgeYears, togetherMilestone } from './pet-dates'

describe('a pet’s age (FB-2/01)', () => {
  it('counts from the birth date when there is one, in years with one decimal', () => {
    expect(petAgeYears({ birth_date: '2020-10-20', age_years: 9 }, '2026-10-20')).toBe(6)
    expect(petAgeYears({ birth_date: '2026-04-20', age_years: null }, '2026-10-20')).toBe(0.5)
    expect(petAgeYears({ birth_date: '2022-04-20', age_years: null }, '2026-10-19')).toBe(4.4)
  })

  it('falls back to the age as typed', () => {
    expect(petAgeYears({ birth_date: null, age_years: 4 }, '2026-10-20')).toBe(4)
    expect(petAgeYears({ birth_date: null, age_years: null }, '2026-10-20')).toBeNull()
  })

  it('turns «about 4 years 6 months» into a day that keeps the age growing', () => {
    expect(approxBirthDate(4, 6, '2026-10-20')).toBe('2022-04-20')
    expect(approxBirthDate(0, 3, '2026-05-31')).toBe('2026-02-28')
  })
})

describe('days together (FB-2/02)', () => {
  it('counts the first day as one', () => {
    expect(daysTogether('2026-10-20', '2026-10-20')).toBe(1)
    expect(daysTogether('2021-03-31', '2026-10-20')).toBe(2030)
    expect(daysTogether(null, '2026-10-20')).toBeNull()
  })

  it('marks every hundred days and every full year', () => {
    expect(togetherMilestone(100)).toBe(true)
    expect(togetherMilestone(2000)).toBe(true)
    expect(togetherMilestone(365)).toBe(true)
    expect(togetherMilestone(2001)).toBe(false)
    expect(togetherMilestone(1)).toBe(false)
  })
})

describe('the birthday (FB-2/02)', () => {
  it('is the same day and month, never on an approximate date', () => {
    expect(isBirthday('2020-10-20', false, '2026-10-20')).toBe(true)
    expect(isBirthday('2020-10-21', false, '2026-10-20')).toBe(false)
    expect(isBirthday('2020-10-20', true, '2026-10-20')).toBe(false)
    expect(isBirthday(null, false, '2026-10-20')).toBe(false)
  })

  it('is not on the day of birth itself', () => {
    expect(isBirthday('2026-10-20', false, '2026-10-20')).toBe(false)
  })

  it('falls on 28 February for one born on the 29th, outside a leap year only', () => {
    expect(isBirthday('2020-02-29', false, '2026-02-28')).toBe(true)
    expect(isBirthday('2020-02-29', false, '2028-02-28')).toBe(false)
    expect(isBirthday('2020-02-29', false, '2028-02-29')).toBe(true)
  })
})

describe('a 29 February birth (FB-2 review)', () => {
  it('turns a year older on 28 February outside a leap year, the day it is greeted', () => {
    const born = { birth_date: '2024-02-29', age_years: null }
    expect(isBirthday(born.birth_date, false, '2025-02-28')).toBe(true)
    expect(headAge(born, '2025-02-28')).toBe(1)
    expect(petAgeYears(born, '2025-02-28')).toBe(1)
    expect(headAge(born, '2025-02-27')).toBe(0)
    expect(headAge(born, '2028-02-28')).toBe(3)
    expect(headAge(born, '2028-02-29')).toBe(4)
  })
})
