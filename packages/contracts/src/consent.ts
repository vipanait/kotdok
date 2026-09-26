import { z } from 'zod'

/**
 * The edition of the consent text a client shows and sends. A new edition
 * changes this, the page at /legal/personal-data and
 * `public.pd_consent_version_is_current` together.
 */
export const PD_CONSENT_VERSION = '2026-09-26'
