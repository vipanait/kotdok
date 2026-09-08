import { localeFromTag, type SupportedLocale } from '@lapka/shared'

/**
 * Where a phone that is not set to Russian lands.
 *
 * The product speaks two languages, and English is the one that reaches
 * further: a Portuguese or Turkish speaker is likelier to read it than
 * Russian. Russian is chosen only when the phone actually asks for it.
 */
export const FALLBACK_LOCALE: SupportedLocale = 'en'

/**
 * The language this phone is set to, as far as the product can honour it.
 *
 * Asked once, at registration, and sent along so the account is created in the
 * right language. Every account used to start Russian because that was the
 * column default, which meant everyone else had to find the setting before the
 * app would talk to them.
 *
 * Read through `Intl` rather than a native module: it is the one source
 * available on both platforms without another dependency. A runtime built
 * without it, or one that throws here, gets the fallback instead of a crash on
 * the sign-up screen.
 */
export function deviceLocale(
  resolve: () => string = () => Intl.DateTimeFormat().resolvedOptions().locale,
): SupportedLocale {
  try {
    return localeFromTag(resolve()) ?? FALLBACK_LOCALE
  } catch {
    return FALLBACK_LOCALE
  }
}
