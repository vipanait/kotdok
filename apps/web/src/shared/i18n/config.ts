// From the one module, not the barrel: `@lapka/shared` re-exports the API
// client, which pulls every contract schema and zod along, and this file is
// imported by the public header — so the landing page used to ship all of it.
import { SUPPORTED_LOCALES, type SupportedLocale } from '@lapka/shared/locale'

export const locales = SUPPORTED_LOCALES
export type Locale = SupportedLocale
export const defaultLocale: Locale = 'ru'

/** The BCP 47 tag `Intl` formatters get for a site language. */
export function intlLocale(locale: Locale): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US'
}
