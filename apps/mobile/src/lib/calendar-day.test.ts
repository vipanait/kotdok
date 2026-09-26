import { describe, expect, it } from 'vitest'
import { addMonths, dayInput, localToday, monthsBetween, parseDayInput } from './calendar-day'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'

describe('the day of a weighing', () => {
  const now = new Date(2026, 8, 25, 1, 30) // 25 Sept, 01:30 local

  it('is the owner’s own day, not UTC’s', () => {
    expect(localToday(now)).toBe('2026-09-25')
  })

  it('is typed as ДД.ММ.ГГГГ and read back as a calendar day', () => {
    expect(dayInput('2026-09-24')).toBe('24.09.2026')
    expect(parseDayInput('24.09.2026', now)).toBe('2026-09-24')
    expect(parseDayInput('24/9/2026', now)).toBe('2026-09-24')
  })

  it('refuses a day that does not exist or has not come yet', () => {
    expect(parseDayInput('30.02.2026', now)).toBeNull()
    expect(parseDayInput('26.09.2026', now)).toBeNull()
    expect(parseDayInput('24.09', now)).toBeNull()
  })
})

describe('showing a day', () => {
  it('prints the day it is, wherever the phone is', () => {
    expect(ru.day('2026-09-12', false)).toBe('12 сентября')
    expect(ru.day('2026-09-12', true)).toBe('12 сентября 2026')
    expect(ru.dayShort('2026-03-12')).toBe('12 мар')
    expect(en.day('2026-09-12', false)).toBe('September 12')
    expect(en.day('2026-09-12', true)).toBe('September 12, 2026')
    expect(en.dayShort('2026-09-12')).toBe('Sep 12')
  })
})

describe('months on the calendar (review M1)', () => {
  it('lands on the last day of a shorter month instead of spilling into the next', () => {
    expect(addMonths('2026-08-31', -6)).toBe('2026-02-28')
    expect(addMonths('2028-02-29', -12)).toBe('2027-02-28')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-03-12', 12)).toBe('2027-03-12')
  })

  it('counts whole months between two days', () => {
    expect(monthsBetween('2026-03-12', '2026-09-12')).toBe(6)
    expect(monthsBetween('2026-03-12', '2026-09-11')).toBe(5)
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(0)
  })
})
