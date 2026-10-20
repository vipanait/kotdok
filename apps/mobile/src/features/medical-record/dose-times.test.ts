import { describe, expect, it } from 'vitest'
import { addTime, readTime, toggleTime } from './dose-times'

describe('the times a course is given at (FB-5/01)', () => {
  it('reads a time however it is typed', () => {
    expect(readTime('7:30')).toBe('07:30')
    expect(readTime('0730')).toBe('07:30')
    expect(readTime('07.30')).toBe('07:30')
    expect(readTime('13;12')).toBe('13:12')
    expect(readTime('7 30')).toBe('07:30')
    expect(readTime('24:00')).toBeNull()
    expect(readTime('утром')).toBeNull()
  })

  it('adds in order, without repeats and within four, and toggles off', () => {
    expect(addTime(['20:00'], '08:00')).toEqual(['08:00', '20:00'])
    expect(addTime(['08:00'], '08:00')).toEqual(['08:00'])
    expect(addTime(['01:00', '02:00', '03:00', '04:00'], '05:00')).toEqual(['01:00', '02:00', '03:00', '04:00'])
    expect(toggleTime(['08:00', '20:00'], '08:00')).toEqual(['20:00'])
  })
})
