import { describe, expect, it } from 'vitest'
import { formatDateTime, toUtcIso } from './datetime'

describe('formatDateTime', () => {
  const iso = '2026-09-23T09:40:00.000Z'

  it('writes a moment the way the language does, without «г.» and «в» in Russian', () => {
    expect(formatDateTime(iso, 'ru', { timeZone: 'Europe/Moscow' })).toBe('23 сентября 2026, 12:40')
    expect(formatDateTime(iso, 'en', { timeZone: 'Europe/Moscow' })).toBe('September 23, 2026, 12:40 PM')
  })

  it('leaves the year out when asked, as the history list does', () => {
    expect(formatDateTime(iso, 'ru', { timeZone: 'Europe/Moscow', year: false })).toBe('23 сентября, 12:40')
    expect(formatDateTime(iso, 'en', { timeZone: 'Europe/Moscow', year: false })).toBe('September 23, 12:40 PM')
  })

  it('reads a database timestamp without a zone as UTC', () => {
    expect(toUtcIso('2026-05-01 10:00:00')).toBe('2026-05-01T10:00:00.000Z')
  })
})
