import { SUPPORTED_LOCALES, type SupportedLocale } from '@lapka/shared'

export const locales = SUPPORTED_LOCALES
export type Locale = SupportedLocale
export const defaultLocale: Locale = 'ru'

/** The BCP 47 tag `Intl` formatters get for a site language. */
export function intlLocale(locale: Locale): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US'
}
