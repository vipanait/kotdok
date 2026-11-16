import { afterEach, describe, expect, it, vi } from 'vitest'
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

  describe('under an Intl that gives no hour or minute parts', () => {
    // Hermes on the iOS 26 simulator: formatToParts returns the day, the month
    // and the year, and no hour, minute or day period. The app wrote «16 ноября 2026, :».
    afterEach(() => vi.restoreAllMocks())
    const dropTime = () => {
      const real = Intl.DateTimeFormat.prototype.formatToParts
      vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(function (this: Intl.DateTimeFormat, date) {
        return real.call(this, date).filter((part) => !['hour', 'minute', 'dayPeriod'].includes(part.type))
      })
    }

    it('writes the time from the phone\'s own clock', () => {
      dropTime()
      const moment = new Date(iso)
      const hh = String(moment.getHours()).padStart(2, '0')
      const mm = String(moment.getMinutes()).padStart(2, '0')
      expect(formatDateTime(iso, 'ru')).toBe(`${moment.getDate()} сентября 2026, ${hh}:${mm}`)
      expect(formatDateTime(iso, 'ru', { year: false })).toBe(`${moment.getDate()} сентября, ${hh}:${mm}`)
      const h12 = String(moment.getHours() % 12 || 12).padStart(2, '0')
      const period = moment.getHours() < 12 ? 'AM' : 'PM'
      expect(formatDateTime(iso, 'en')).toBe(`September ${moment.getDate()}, 2026, ${h12}:${mm} ${period}`)
    })

    it('never leaves a bare colon', () => {
      dropTime()
      expect(formatDateTime(iso, 'ru')).not.toMatch(/, :$/)
      expect(formatDateTime(iso, 'en', { year: false })).not.toMatch(/ :/)
    })
  })

  it('reads a database timestamp without a zone as UTC', () => {
    expect(toUtcIso('2026-05-01 10:00:00')).toBe('2026-05-01T10:00:00.000Z')
  })
})
