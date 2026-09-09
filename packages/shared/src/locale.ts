/** Locales the product ships, matching the profiles.locale check constraint. */
export const SUPPORTED_LOCALES = ['ru', 'en'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Reading a language tag the way the outside world writes it.
 *
 * Devices, browsers and identity providers all volunteer a language, and none
 * of them agree on the shape: "en", "en-GB", "ru_RU", "EN-us". Every one of
 * those means a language this product speaks, and the alternative to reading
 * them is defaulting everyone to Russian — which is what the app did.
 *
 * @returns the locale, or null when the tag names a language we do not have.
 * Null is deliberately not "ru": the caller decides what to do about a Spanish
 * speaker, and silently calling them Russian is not obviously it.
 */
export function localeFromTag(tag: string | null | undefined): SupportedLocale | null {
  if (typeof tag !== 'string') return null

  // "ru-RU", "ru_RU", "ru" — the subtag before the first separator is the
  // language, and it is the only part this product distinguishes.
  const language = tag.trim().toLowerCase().split(/[-_]/)[0]

  return isSupportedLocale(language) ? language : null
}

/**
 * The first tag that names a language we speak.
 *
 * A device or a browser offers a list in order of preference, and the right
 * answer is the first one we can honour rather than the first one offered.
 */
export function preferredLocale(tags: readonly (string | null | undefined)[]): SupportedLocale | null {
  for (const tag of tags) {
    const locale = localeFromTag(tag)
    if (locale) return locale
  }
  return null
}
