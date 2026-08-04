import { describe, expect, it } from 'vitest'
import { sanitizePainSigns } from '@/shared/utils/check-params'

describe('sanitizePainSigns', () => {
  it('keeps allowlisted values from an array and drops unknown ones', () => {
    expect(sanitizePainSigns(['tense', 'fake', 'hiding', 'tense'])).toEqual(['tense', 'hiding'])
  })

  it('parses a comma-separated string and preserves allowlist order', () => {
    expect(sanitizePainSigns('vocalizing,hunched,grimace,not-a-sign')).toEqual([
      'hunched',
      'grimace',
      'vocalizing',
    ])
  })

  it('returns an empty array for empty or invalid input', () => {
    expect(sanitizePainSigns(null)).toEqual([])
    expect(sanitizePainSigns(undefined)).toEqual([])
    expect(sanitizePainSigns('')).toEqual([])
    expect(sanitizePainSigns({})).toEqual([])
    expect(sanitizePainSigns(['nope'])).toEqual([])
  })
})
