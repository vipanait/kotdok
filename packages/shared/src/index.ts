// Portable helpers and dictionaries shared by both apps.
//
// Skeleton only: the existing translations and pure helpers move here in
// stage 1. Nothing here may import Next.js, a server SDK or anything from the
// DOM.

/** Locales the product ships, matching the profiles.locale check constraint. */
export const SUPPORTED_LOCALES = ['ru', 'en'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export * from './api-client'
