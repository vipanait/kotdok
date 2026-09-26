import { PD_CONSENT_VERSION } from '@lapka/contracts'
import {
  PROVIDER_CONSENT_COOKIE,
  PROVIDER_CONSENT_COOKIE_MAX_AGE,
  PROVIDER_CONSENT_COOKIE_PATH,
} from '@/shared/consent-cookie'

/** Called by the registration page right before it leaves for the provider. */
export function rememberProviderConsent(): void {
  document.cookie =
    `${PROVIDER_CONSENT_COOKIE}=${PD_CONSENT_VERSION}; Max-Age=${PROVIDER_CONSENT_COOKIE_MAX_AGE}; ` +
    `Path=${PROVIDER_CONSENT_COOKIE_PATH}; SameSite=Lax` +
    (window.location.protocol === 'https:' ? '; Secure' : '')
}
