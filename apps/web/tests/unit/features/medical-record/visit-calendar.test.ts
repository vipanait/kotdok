import { describe, expect, it } from 'vitest'
import type { HealthEvent } from '@lapka/contracts'
import ru from '@/shared/i18n/dictionaries/ru'
import { visitCalendarHref } from '@/features/medical-record/visits/visit-calendar'

const visit: HealthEvent = {
  id: '00000000-0000-4000-8000-000000000108',
  kind: 'visit',
  status: 'planned',
  date: '2026-10-21',
  items: [],
  notes: 'Обсудить анализы',
  visit_kind: 'checkup',
  clinic: 'Клиника «Айболит»',
  reason: 'Плановый осмотр',
  diagnosis: null,
  check_id: null,
} as unknown as HealthEvent

describe('«Добавить в Google Календарь» for a planned visit (design `visit`)', () => {
  it('names the pet and the visit, on the visit’s day, at its clinic', () => {
    const url = visitCalendarHref(ru, 'Мурка', visit, '2026-10-20')!
    const params = new URL(url).searchParams
    expect(params.get('text')).toBe('Мурка: визит к врачу — осмотр')
    expect(params.get('dates')).toBe('20261021/20261022')
    expect(params.get('location')).toBe('Клиника «Айболит»')
  })

  it('carries the visit’s own reason and note, and nothing else of the record', () => {
    const details = new URL(visitCalendarHref(ru, 'Мурка', visit, '2026-10-20')!).searchParams.get('details')
    expect(details).toBe('Плановый осмотр\n\nОбсудить анализы')
  })

  it('follows a moved visit to its new day', () => {
    const moved = { ...visit, date: '2026-11-03' }
    expect(new URL(visitCalendarHref(ru, 'Мурка', moved, '2026-10-20')!).searchParams.get('dates')).toBe('20261103/20261104')
  })

  it('is offered for a planned visit today or ahead, not for a past day or a visit that happened', () => {
    expect(visitCalendarHref(ru, 'Мурка', { ...visit, date: '2026-10-20' }, '2026-10-20')).not.toBeNull()
    expect(visitCalendarHref(ru, 'Мурка', { ...visit, date: '2026-10-19' }, '2026-10-20')).toBeNull()
    expect(visitCalendarHref(ru, 'Мурка', { ...visit, status: 'done' } as HealthEvent, '2026-10-20')).toBeNull()
  })

  it('a visit with no kind, place or words is just the visit', () => {
    const bare = { ...visit, visit_kind: null, clinic: null, reason: null, notes: null } as unknown as HealthEvent
    const params = new URL(visitCalendarHref(ru, 'Мурка', bare, '2026-10-20')!).searchParams
    expect(params.get('text')).toBe('Мурка: визит к врачу')
    expect(params.has('details')).toBe(false)
    expect(params.has('location')).toBe(false)
  })
})
