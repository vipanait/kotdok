import { describe, expect, it } from 'vitest'
import { addTime, editTime, readTime, toggleTime } from './dose-times'

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

  it('does not read three digits as a time: «123» is «12:30» half typed', () => {
    expect(readTime('123')).toBeNull()
    expect(readTime('730')).toBeNull()
  })

  it('adds in order, without repeats and within four, and toggles off', () => {
    expect(addTime(['20:00'], '08:00')).toEqual(['08:00', '20:00'])
    expect(addTime(['08:00'], '08:00')).toEqual(['08:00'])
    expect(addTime(['01:00', '02:00', '03:00', '04:00'], '05:00')).toEqual(['01:00', '02:00', '03:00', '04:00'])
    expect(toggleTime(['08:00', '20:00'], '08:00')).toEqual(['20:00'])
  })
})

describe('editing «Своё время» (design 20 October 2026)', () => {
  it('keeps a time on its way, and a deletion', () => {
    expect(editTime('', '1')).toBe('1')
    expect(editTime('1', '12')).toBe('12')
    expect(editTime('12', '12:')).toBe('12:')
    expect(editTime('12', '123')).toBe('123')
    expect(editTime('07:30', '07:3')).toBe('07:3')
    expect(editTime('07:3', '')).toBe('')
  })

  it('reads a whole time, typed or pasted', () => {
    expect(editTime('123', '1230')).toBe('12:30')
    expect(editTime('', '0730')).toBe('07:30')
    expect(editTime('', '13;12')).toBe('13:12')
    expect(editTime('7:3', '7:30')).toBe('07:30')
  })

  it('does not let a second time pile onto the first, nor letters in', () => {
    expect(editTime('13:12', '13:1213:12')).toBe('13:12')
    expect(editTime('13;12', '13;1213:12')).toBe('13;12')
    expect(editTime('', 'утром')).toBe('')
    expect(editTime('12', '12a')).toBe('12')
  })
})
