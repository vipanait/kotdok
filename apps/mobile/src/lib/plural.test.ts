import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import { plural } from './plural'

/** The phrases the rule actually serves, which is where it is worth testing. */
const checksOf = (count: number) => ru.profile.checksLeft(count).split(' ')[0]
const years = (count: number) => ru.petAge(count)

describe('russian plurals', () => {
  it('uses the singular for one and the ones that end in it', () => {
    expect(checksOf(1)).toBe('проверка')
    expect(checksOf(21)).toBe('проверка')
    expect(checksOf(101)).toBe('проверка')
  })

  it('uses the few form for two to four', () => {
    expect(checksOf(2)).toBe('проверки')
    expect(checksOf(3)).toBe('проверки')
    expect(checksOf(4)).toBe('проверки')
    expect(checksOf(22)).toBe('проверки')
  })

  it('uses the many form for zero and from five up', () => {
    expect(checksOf(0)).toBe('проверок')
    expect(checksOf(5)).toBe('проверок')
    expect(checksOf(10)).toBe('проверок')
  })

  it('treats the teens as the exception they are', () => {
    // The trap: 11 ends in 1 and 12 in 2, yet both take the many form.
    for (const count of [11, 12, 13, 14, 111, 112]) {
      expect(checksOf(count), String(count)).toBe('проверок')
    }
  })

  it('spells out an age with its own three words', () => {
    expect(years(1)).toBe('1 год')
    expect(years(3)).toBe('3 года')
    expect(years(5)).toBe('5 лет')
    expect(years(13)).toBe('13 лет')
  })

  it('works for any three words, not only this one', () => {
    expect(plural(1, 'день', 'дня', 'дней')).toBe('день')
    expect(plural(3, 'день', 'дня', 'дней')).toBe('дня')
    expect(plural(13, 'день', 'дня', 'дней')).toBe('дней')
  })
})
