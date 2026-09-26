import { beforeEach, describe, expect, it, vi } from 'vitest'

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}))

const { getOwnerToday } = await import('@/server/i18n/get-time-zone')

// 00:30 in Moscow on 26 September is still 25 September in UTC, the server's clock.
const MOSCOW_HALF_PAST_MIDNIGHT = new Date('2026-09-25T21:30:00Z')

describe('the owner’s today on a page the server draws (new-record forms)', () => {
  beforeEach(() => jar.clear())

  it('is the day in the owner’s zone, not the server’s UTC day', async () => {
    jar.set('lapka-tz', 'Europe/Moscow')
    expect(await getOwnerToday(MOSCOW_HALF_PAST_MIDNIGHT)).toBe('2026-09-26')
    jar.set('lapka-tz', 'America/New_York')
    expect(await getOwnerToday(MOSCOW_HALF_PAST_MIDNIGHT)).toBe('2026-09-25')
  })

  it('falls back to Moscow before the browser has said its zone, or with a broken cookie', async () => {
    expect(await getOwnerToday(MOSCOW_HALF_PAST_MIDNIGHT)).toBe('2026-09-26')
    jar.set('lapka-tz', 'Not/AZone')
    expect(await getOwnerToday(MOSCOW_HALF_PAST_MIDNIGHT)).toBe('2026-09-26')
  })
})
