import { describe, expect, it } from 'vitest'
import { FALLBACK_LOCALE, deviceLocale } from './device-locale'

describe('the language this phone is set to', () => {
  it('honours a language the product speaks', () => {
    expect(deviceLocale(() => 'en-GB')).toBe('en')
    expect(deviceLocale(() => 'ru-RU')).toBe('ru')
  })

  it('sends everyone who is not Russian to English', () => {
    // Two languages, and only one of them is chosen by a positive signal.
    for (const tag of ['pt-BR', 'de', 'tr-TR', 'zh-Hans-CN', '', 'nonsense']) {
      expect(deviceLocale(() => tag), tag).toBe('en')
    }
    expect(FALLBACK_LOCALE).toBe('en')
  })

  it('does not take the sign-up screen down with it', () => {
    // A runtime built without Intl, or one that throws while resolving: worth
    // a wrong default, not worth a crash on the first screen of the app.
    expect(
      deviceLocale(() => {
        throw new Error('Intl is not available')
      }),
    ).toBe(FALLBACK_LOCALE)
  })
})
