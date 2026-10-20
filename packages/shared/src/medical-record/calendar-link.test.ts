import { describe, expect, it } from 'vitest'
import { calendarLink } from './calendar-link'

/** The link's query, read back (the package has no DOM, so no URL here). */
function params(url: string): Map<string, string> {
  const query = url.slice(url.indexOf('?') + 1)
  return new Map(query.split('&').map((pair) => pair.split('=').map(decodeURIComponent) as [string, string]))
}

/** The test runner's environment; the package itself never reads it. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

describe('a planned record as a Google Calendar event (FB-3/01)', () => {
  it('opens a filled TEMPLATE on calendar.google.com for the owner to save', () => {
    const url = calendarLink({ title: 'Мурка: визит к врачу', date: '2026-10-21' })
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true)
    expect(params(url).get('action')).toBe('TEMPLATE')
    expect(params(url).get('text')).toBe('Мурка: визит к врачу')
  })

  it('takes the whole day: from the record’s day to the next calendar day', () => {
    expect(params(calendarLink({ title: 'x', date: '2026-10-21' })).get('dates')).toBe('20261021/20261022')
  })

  it('rolls over the end of a month and of a year', () => {
    expect(params(calendarLink({ title: 'x', date: '2026-10-31' })).get('dates')).toBe('20261031/20261101')
    expect(params(calendarLink({ title: 'x', date: '2026-12-31' })).get('dates')).toBe('20261231/20270101')
  })

  it('knows the leap day', () => {
    expect(params(calendarLink({ title: 'x', date: '2028-02-28' })).get('dates')).toBe('20280228/20280229')
    expect(params(calendarLink({ title: 'x', date: '2028-02-29' })).get('dates')).toBe('20280229/20280301')
    expect(params(calendarLink({ title: 'x', date: '2027-02-28' })).get('dates')).toBe('20270228/20270301')
  })

  it('is not moved by the clock’s zone: the day is a calendar day, not a moment', () => {
    const before = env.TZ
    try {
      for (const zone of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Moscow']) {
        env.TZ = zone
        expect(params(calendarLink({ title: 'x', date: '2026-03-29' })).get('dates')).toBe('20260329/20260330')
      }
    } finally {
      env.TZ = before
    }
  })

  it('keeps Cyrillic and special characters whole', () => {
    const event = { title: 'Мурка & Барсик: «осмотр» #1 / 50%+', date: '2026-10-21', details: 'Обсудить анализы?\nКурс: Нефростоп', location: 'Клиника «Айболит», ул. Ленина, 5' }
    const read = params(calendarLink(event))
    expect(read.get('text')).toBe(event.title)
    expect(read.get('details')).toBe(event.details)
    expect(read.get('location')).toBe(event.location)
  })

  it('leaves out details and place it was not given', () => {
    const read = params(calendarLink({ title: 'x', date: '2026-10-21', details: null, location: '' }))
    expect(read.has('details')).toBe(false)
    expect(read.has('location')).toBe(false)
  })
})
