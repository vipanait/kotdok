import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import { calendarLink, calendarTitle } from './calendar-link'

describe('a planned date as a Google Calendar event (FB-3/01)', () => {
  it('opens the template with the title, the whole day and the clinic, encoded', () => {
    const url = new URL(calendarLink({ title: 'Мурка: визит к врачу', date: '2026-10-21', location: 'Вега & Ко #1' }))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Мурка: визит к врачу')
    expect(url.searchParams.get('dates')).toBe('20261021/20261022')
    expect(url.searchParams.get('location')).toBe('Вега & Ко #1')
    expect(url.searchParams.has('details')).toBe(false)
  })

  it('ends a day on the last of the year in the next year', () => {
    expect(new URL(calendarLink({ title: 'x', date: '2026-12-31' })).searchParams.get('dates')).toBe('20261231/20270101')
  })

  it('names the pet before what is due', () => {
    expect(calendarTitle(ru, 'Мурка', 'визит к врачу')).toBe('Мурка: визит к врачу')
  })
})
