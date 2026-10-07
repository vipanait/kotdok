import { describe, expect, it } from 'vitest'
import { addMonths, dayInput, localToday, monthGrid, monthOf, monthsBetween, parseDayInput, parseDayText, shiftMonth, typedDay } from './calendar-day'
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

describe('typing a day on a keyboard with no dot', () => {
  it('puts the dots in as the digits arrive', () => {
    // Was: «15112027» typed on Android, refused as not a date.
    expect(typedDay('15112027')).toBe('15.11.2027')
    expect(parseDayText(typedDay('15112027'))).toBe('2027-11-15')
    expect(typedDay('1')).toBe('1')
    expect(typedDay('15')).toBe('15')
    expect(typedDay('151')).toBe('15.1')
    expect(typedDay('1511')).toBe('15.11')
    expect(typedDay('15112')).toBe('15.11.2')
  })

  it('lets a digit go back without a dot left behind', () => {
    // Backspace on «15.1» leaves «15.», which reads as «15».
    expect(typedDay('15.')).toBe('15')
    expect(typedDay('15.11.')).toBe('15.11')
  })

  it('keeps a day already written, and stops at eight digits', () => {
    expect(typedDay('07.10.2026')).toBe('07.10.2026')
    expect(typedDay('07.10.20261')).toBe('07.10.2026')
    expect(typedDay('')).toBe('')
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

describe('the calendar sheet', () => {
  it('pages across the turn of the year both ways', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(monthOf('2026-09-24')).toEqual({ year: 2026, month: 9 })
  })

  it('starts a Russian week on Monday and an English one on Sunday', () => {
    // 1 October 2026 is a Thursday.
    const monday = monthGrid({ year: 2026, month: 10 }, 1)
    expect(monday[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    const sunday = monthGrid({ year: 2026, month: 10 }, 0)
    expect(sunday[0].slice(0, 5)).toEqual([null, null, null, null, '2026-10-01'])
  })

  it('holds every day of the month once, in whole weeks', () => {
    const grid = monthGrid({ year: 2028, month: 2 }, 1)
    const days = grid.flat().filter(Boolean)
    expect(days).toHaveLength(29)
    expect(days.at(-1)).toBe('2028-02-29')
    expect(grid.every((week) => week.length === 7)).toBe(true)
  })
})
