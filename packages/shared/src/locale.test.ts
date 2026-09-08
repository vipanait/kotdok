import { describe, expect, it } from 'vitest'
import { localeFromTag, preferredLocale } from './locale'

describe('reading a language tag', () => {
  it('accepts the shapes the outside world actually sends', () => {
    for (const tag of ['en', 'en-GB', 'en_US', 'EN-us', '  en  ']) {
      expect(localeFromTag(tag), tag).toBe('en')
    }
    for (const tag of ['ru', 'ru-RU', 'ru_RU']) {
      expect(localeFromTag(tag), tag).toBe('ru')
    }
  })

  it('says nothing rather than guessing for a language we do not speak', () => {
    // Not "ru": calling a Spanish speaker Russian is a decision, and it is the
    // caller's to make, out loud.
    for (const tag of ['es', 'de-DE', 'zh-Hans-CN', '', '   ', 'x']) {
      expect(localeFromTag(tag), tag).toBeNull()
    }
  })

  it('survives a caller that has nothing to offer', () => {
    expect(localeFromTag(null)).toBeNull()
    expect(localeFromTag(undefined)).toBeNull()
    expect(localeFromTag(42 as unknown as string)).toBeNull()
  })

  it('takes the first preference it can honour, not the first offered', () => {
    expect(preferredLocale(['de-DE', 'fr', 'en-GB', 'ru'])).toBe('en')
    expect(preferredLocale(['de', 'fr'])).toBeNull()
    expect(preferredLocale([])).toBeNull()
  })

  it('is not fooled by a language that merely starts the same way', () => {
    // "ruk" is Che, not Russian; "eng" is not the two-letter tag either.
    expect(localeFromTag('ruk')).toBeNull()
    expect(localeFromTag('eng-US')).toBeNull()
  })
})
