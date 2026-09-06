import { describe, expect, it } from 'vitest'
import { API_VERSION, type ApiErrorEnvelope } from '@lapka/contracts'
import { SUPPORTED_LOCALES, isSupportedLocale } from '@lapka/shared'
import { defaultLocale, locales } from '@/shared/i18n/config'

// Resolution smoke test for the workspace packages (plan item 0.1/03). The
// contracts themselves arrive in stage 1.
describe('workspace packages resolve from the web app', () => {
  it('exposes the API version prefix', () => {
    expect(API_VERSION).toBe('v1')
  })

  it('types the error envelope', () => {
    const envelope: ApiErrorEnvelope = {
      error: { code: 'not_found', message: 'gone', request_id: 'req-1' },
    }

    expect(envelope.error.code).toBe('not_found')
  })

  it('keeps the web locale list backed by the shared one', () => {
    expect(locales).toEqual(SUPPORTED_LOCALES)
    expect(isSupportedLocale(defaultLocale)).toBe(true)
    expect(isSupportedLocale('de')).toBe(false)
  })
})
