import { describe, expect, it } from 'vitest'
import { checksWord, plural } from './plural'

describe('russian plurals', () => {
  it('uses the singular for one and the ones that end in it', () => {
    expect(checksWord(1)).toBe('проверка')
    expect(checksWord(21)).toBe('проверка')
    expect(checksWord(101)).toBe('проверка')
  })

  it('uses the few form for two to four', () => {
    expect(checksWord(2)).toBe('проверки')
    expect(checksWord(3)).toBe('проверки')
    expect(checksWord(4)).toBe('проверки')
    expect(checksWord(22)).toBe('проверки')
  })

  it('uses the many form for zero and from five up', () => {
    expect(checksWord(0)).toBe('проверок')
    expect(checksWord(5)).toBe('проверок')
    expect(checksWord(10)).toBe('проверок')
  })

  it('treats the teens as the exception they are', () => {
    // The trap: 11 ends in 1 and 12 in 2, yet both take the many form.
    for (const count of [11, 12, 13, 14, 111, 112]) {
      expect(checksWord(count), String(count)).toBe('проверок')
    }
  })

  it('works for any three words, not only this one', () => {
    expect(plural(1, 'день', 'дня', 'дней')).toBe('день')
    expect(plural(3, 'день', 'дня', 'дней')).toBe('дня')
    expect(plural(13, 'день', 'дня', 'дней')).toBe('дней')
  })
})
