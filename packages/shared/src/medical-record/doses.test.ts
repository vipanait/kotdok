import { describe, expect, it } from 'vitest'
import type { Medication } from '@lapka/contracts'
import { addTime, editTime, givenOn, readTime, removeTime, todayDoses } from './doses'

const course = (overrides: Partial<Medication> = {}): Medication => ({
  id: 'c1',
  name: 'Нефростоп',
  dosage: '1 таблетка',
  started_on: '2026-10-01',
  ended_on: null,
  ongoing: true,
  source: 'record',
  reminder_times: ['08:00', '20:00'],
  ...overrides,
})

const DAY = '2026-10-20'

describe('the days a course is given on (FB-5, the phone’s rule)', () => {
  it('from the start to the last day, both included', () => {
    const run = course({ started_on: '2026-10-10', ended_on: '2026-10-20', ongoing: false })
    expect(givenOn(run, '2026-10-09')).toBe(false)
    expect(givenOn(run, '2026-10-10')).toBe(true)
    expect(givenOn(run, '2026-10-20')).toBe(true)
    expect(givenOn(run, '2026-10-21')).toBe(false)
  })

  it('a course without a start (brought over from the pet form) runs until its end', () => {
    expect(givenOn(course({ started_on: null }), DAY)).toBe(true)
  })
})

describe('«Сегодня» on the pet card (FB-5/04)', () => {
  it('lists every time of every course running today, in time order, given or not', () => {
    const second = course({ id: 'c2', name: 'Витамины', reminder_times: ['12:00'] })
    const given = [{ medication_id: 'c1', taken_on: DAY, slot: '08:00' }]
    expect(todayDoses([course(), second], given, DAY, '10:00').map((dose) => `${dose.slot} ${dose.course.id} ${dose.state}`)).toEqual([
      '08:00 c1 given',
      '12:00 c2 due',
      '20:00 c1 due',
    ])
  })

  it('a time already past and not marked is «missed»; marked on another day it does not count', () => {
    const yesterday = [{ medication_id: 'c1', taken_on: '2026-10-19', slot: '08:00' }]
    expect(todayDoses([course()], yesterday, DAY, '12:00')[0].state).toBe('missed')
  })

  it('belongs to the owner’s day: just after midnight the new day starts unmarked', () => {
    const lateLastNight = [{ medication_id: 'c1', taken_on: '2026-10-19', slot: '20:00' }]
    expect(todayDoses([course()], lateLastNight, DAY, '00:05').map((dose) => dose.state)).toEqual(['due', 'due'])
  })

  it('shows the last day of a course, and nothing after it or before the start', () => {
    expect(todayDoses([course({ ended_on: DAY, ongoing: false })], [], DAY, '07:00')).toHaveLength(2)
    expect(todayDoses([course({ ended_on: '2026-10-19', ongoing: false })], [], DAY, '07:00')).toEqual([])
    expect(todayDoses([course({ started_on: '2026-10-21' })], [], DAY, '07:00')).toEqual([])
  })

  it('a course without times has no doses to mark', () => {
    expect(todayDoses([course({ reminder_times: [] })], [], DAY, '07:00')).toEqual([])
  })

  it('a dose of another course at the same time is that course’s', () => {
    const other = course({ id: 'c2' })
    const given = [{ medication_id: 'c2', taken_on: DAY, slot: '08:00' }]
    const states = todayDoses([course(), other], given, DAY, '07:00').map((dose) => `${dose.course.id} ${dose.slot} ${dose.state}`)
    expect(states).toContain('c1 08:00 due')
    expect(states).toContain('c2 08:00 given')
  })
})

describe('the times a course is given at (FB-5/01)', () => {
  it('reads a time however it is typed', () => {
    expect(readTime('7:30')).toBe('07:30')
    expect(readTime('0730')).toBe('07:30')
    expect(readTime('07.30')).toBe('07:30')
    expect(readTime('13;12')).toBe('13:12')
    expect(readTime('7 30')).toBe('07:30')
    expect(readTime('24:00')).toBeNull()
    expect(readTime('утром')).toBeNull()
    expect(readTime('123')).toBeNull()
  })

  it('adds in order, without repeats and within four', () => {
    expect(addTime(['20:00'], '08:00')).toEqual(['08:00', '20:00'])
    expect(addTime(['08:00'], '08:00')).toEqual(['08:00'])
    expect(addTime(['01:00', '02:00', '03:00', '04:00'], '05:00')).toEqual(['01:00', '02:00', '03:00', '04:00'])
  })

  it('removes one time', () => {
    expect(removeTime(['08:00', '20:00'], '08:00')).toEqual(['20:00'])
  })

  it('keeps a time on its way as typed, reads a pasted one, refuses letters', () => {
    expect(editTime('', '1')).toBe('1')
    expect(editTime('12', '12:')).toBe('12:')
    expect(editTime('', '0730')).toBe('07:30')
    expect(editTime('', 'утром')).toBe('')
    expect(editTime('13:12', '13:1213:12')).toBe('13:12')
  })
})
