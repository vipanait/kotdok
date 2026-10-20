import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import type { HealthEvent } from '@lapka/contracts'
import { calendarEvent, calendarLink, calendarTitle } from './calendar-link'

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

describe('what a planned record becomes in the calendar (FB-3 review)', () => {
  const record = (overrides: Partial<HealthEvent>): HealthEvent => ({
    id: 'e',
    kind: 'vaccination',
    status: 'planned',
    date: '2026-10-21',
    clinic: 'Вега',
    notes: null,
    items: [],
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
    ...overrides,
  })
  const item = (name: string | null, targets: string[] = []) =>
    ({ id: name ?? 'x', name, targets, source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null }) as HealthEvent['items'][number]

  it('names a visit, and one vaccination by its item', () => {
    expect(calendarEvent(ru, 'Мурка', record({ kind: 'visit', visit_kind: 'checkup' }))).toMatchObject({ title: 'Мурка: визит к врачу', location: 'Вега' })
    expect(calendarEvent(ru, 'Мурка', record({ items: [item('Нобивак Tricat')] })).title).toBe('Мурка: прививка «Нобивак Tricat»')
  })

  it('counts several items in the title and lists them all in the details', () => {
    const event = calendarEvent(ru, 'Мурка', record({ items: [item('Нобивак Tricat'), item(null, ['rabies'])], notes: 'Натощак' }))
    expect(event.title).toBe('Мурка: 2 прививки')
    expect(event.details).toBe('Нобивак Tricat\nПрививка от бешенства\n\nНатощак')
  })
})
