import { describe, expect, it } from 'vitest'
import type { Medication } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { isCurrentCourse as isCurrent, splitCourses } from '@lapka/shared'
import { blankCourse, courseDates, readCourses } from './medications'

const TODAY = '2026-09-24'
const NOW = new Date(2026, 8, 24, 12, 0)

function course(overrides: Partial<Medication>): Medication {
  return { id: 'm', name: 'Лечебный корм', dosage: null, started_on: null, ended_on: null, ongoing: false, source: 'record', ...overrides }
}

describe('when a course is current', () => {
  it('is current with no end or an end after today; done on its last day', () => {
    expect(isCurrent(course({}), TODAY)).toBe(true)
    expect(isCurrent(course({ ended_on: '2026-09-25' }), TODAY)).toBe(true)
    expect(isCurrent(course({ ended_on: TODAY }), TODAY)).toBe(false)
  })

  it('splits into «Сейчас» and «Раньше», latest first', () => {
    const { current, past } = splitCourses(
      [course({ id: 'a', ended_on: '2026-08-15', started_on: '2026-08-02' }), course({ id: 'b', started_on: '2026-08-02', ongoing: true })],
      TODAY,
    )
    expect(current.map((c) => c.id)).toEqual(['b'])
    expect(past.map((c) => c.id)).toEqual(['a'])
  })
})

describe('the dates of a course (MR-06.4)', () => {
  it('reads each kind of course differently', () => {
    expect(courseDates(ru, course({ started_on: '2026-08-02', ongoing: true }), TODAY)).toBe('с 2 августа · постоянно')
    expect(courseDates(ru, course({ started_on: '2026-08-02', ended_on: '2026-08-15' }), TODAY)).toBe('2–15 августа')
    expect(courseDates(ru, course({ started_on: '2026-07-28', ended_on: '2026-08-15' }), TODAY)).toBe('28 июля – 15 августа')
    expect(courseDates(ru, course({ started_on: '2025-12-20', ended_on: '2026-01-10' }), TODAY)).toBe('20 декабря 2025 – 10 января 2026')
    expect(courseDates(ru, course({ started_on: '2026-08-02' }), TODAY)).toBe('с 2 августа')
    expect(courseDates(ru, course({ source: 'form' }), TODAY)).toBe('Из анкеты — добавьте дозировку и даты')
    // Ended on the day it started (MW-05: «Завершить курс» on a course begun today).
    expect(courseDates(ru, course({ started_on: TODAY, ended_on: TODAY }), TODAY)).toBe('24 сентября')
  })
})

describe('the course form', () => {
  it('builds several courses, today by default', () => {
    const read = readCourses(ru, [
      { ...blankCourse('a', NOW), name: 'Фортифлора', dosage: '1 пакетик в день', end: '07.10.2026' },
      { ...blankCourse('b', NOW), name: 'Лечебный корм', ongoing: true },
    ])
    expect(read.ok && read.value).toEqual([
      { name: 'Фортифлора', dosage: '1 пакетик в день', started_on: '2026-09-24', ended_on: '2026-10-07', ongoing: false },
      { name: 'Лечебный корм', dosage: null, started_on: '2026-09-24', ended_on: null, ongoing: true },
    ])
  })

  it('refuses no name, a bad date and an end before the start (MR-06.4)', () => {
    const read = readCourses(ru, [
      { ...blankCourse('a', NOW) },
      { ...blankCourse('b', NOW), name: 'x', start: '31.02.2026' },
      { ...blankCourse('c', NOW), name: 'y', end: '01.09.2026' },
    ])
    expect(!read.ok && read.errors).toEqual({
      a: { name: 'Введите название' },
      b: { start: 'Дата — ДД.ММ.ГГГГ' },
      c: { end: 'Окончание — не раньше начала' },
    })
  })

  it('leaves the start empty when the owner clears it', () => {
    const read = readCourses(ru, [{ ...blankCourse('a', NOW), name: 'x', start: '' }])
    expect(read.ok && read.value[0].started_on).toBeNull()
  })
})
