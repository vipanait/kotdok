/**
 * Carries the registration page's ticked consent box across a provider
 * sign-in, which cannot carry sign-up metadata. Only this site's own page sets
 * it, so a forged link to /auth/callback cannot consent on somebody's behalf.
 */
export const PROVIDER_CONSENT_COOKIE = 'lapka_pd_consent'

/** Scoped to the callback and short-lived: it is read once, on the way back. */
export const PROVIDER_CONSENT_COOKIE_PATH = '/auth/callback'
export const PROVIDER_CONSENT_COOKIE_MAX_AGE = 15 * 60
