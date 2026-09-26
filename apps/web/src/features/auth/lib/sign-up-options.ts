import { PD_CONSENT_VERSION } from '@lapka/contracts'
import type { Locale } from '@/shared/i18n/config'

/**
 * Options for an email sign-up from the site.
 *
 * `locale` is the language the page is shown in. The trigger that creates the
 * profile takes it from here, and without it every site sign-up became English
 * while reading Russian — so the analyses came back in a language the person
 * never chose. The mobile app sends the device language the same way.
 *
 * `pd_consent` is the ticked consent box: the form does not submit without it,
 * and the same trigger records it, so an email sign-up needs no second step.
 */
export function emailSignUpOptions(origin: string, next: string, locale: Locale) {
  return {
    emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    data: { locale, pd_consent: { version: PD_CONSENT_VERSION, source: 'web' as const } },
  }
}
