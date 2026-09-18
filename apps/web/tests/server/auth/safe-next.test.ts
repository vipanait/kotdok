import { describe, expect, it } from 'vitest'
import { getSafeNextPath } from '@/shared/security/safe-next'

const ORIGIN = 'https://lapka.my'

describe('getSafeNextPath', () => {
  it('keeps a path on this site', () => {
    expect(getSafeNextPath('/checks?page=2')).toBe('/checks?page=2')
  })

  it('falls back to the dashboard when there is no destination', () => {
    expect(getSafeNextPath(null)).toBe('/dashboard')
  })

  it.each([
    ['protocol-relative', '//evil.com'],
    ['absolute', 'https://evil.com'],
    ['backslash', '/\\evil.com'],
    ['backslash pair', '/\\\\evil.com'],
    ['tab before a slash', '/\t/evil.com'],
    ['newline before a slash', '/\n/evil.com'],
    ['carriage return before a slash', '/\r/evil.com'],
  ])('refuses a destination that leaves the site: %s', (_name, next) => {
    // The guard is only worth anything if the browser agrees: whatever it
    // returns has to resolve back to our own origin.
    expect(new URL(getSafeNextPath(next), ORIGIN).origin).toBe(ORIGIN)
    expect(getSafeNextPath(next)).toBe('/dashboard')
  })
})
