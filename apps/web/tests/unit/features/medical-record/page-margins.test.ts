import { describe, expect, it } from 'vitest'
import { printsPageMargins } from '@/features/medical-record/summary/page-margins'

describe('printsPageMargins (MW-09: the footer is printed once a page)', () => {
  it('is Chromium 131 and later, where the page margins carry the footer', () => {
    const chrome = [
      { brand: 'Not)A;Brand', version: '8' },
      { brand: 'Chromium', version: '153' },
      { brand: 'Google Chrome', version: '153' },
    ]
    expect(printsPageMargins(chrome)).toBe(true)
    expect(printsPageMargins([{ brand: 'Chromium', version: '131' }, { brand: 'Microsoft Edge', version: '131' }])).toBe(true)
  })

  it('keeps the closing footer in an older Chromium and wherever the browser does not say', () => {
    expect(printsPageMargins([{ brand: 'Chromium', version: '130' }])).toBe(false)
    // Safari and Firefox have no user-agent brands.
    expect(printsPageMargins(undefined)).toBe(false)
    expect(printsPageMargins([])).toBe(false)
    // A brand that is not the engine proves nothing.
    expect(printsPageMargins([{ brand: 'Google Chrome', version: '153' }])).toBe(false)
    expect(printsPageMargins([{ brand: 'Chromium', version: 'x' }])).toBe(false)
  })
})
