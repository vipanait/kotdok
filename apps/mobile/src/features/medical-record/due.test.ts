import { describe, expect, it } from 'vitest'
import type { HealthEvent } from '@lapka/contracts'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { lastDoneDate } from '@lapka/shared'
import { coreStatuses, dueItems, dueLine, dueStatus, itemTitle, nextYear, saveSummary } from './due'

const TODAY = '2026-09-24'

function event(overrides: Partial<HealthEvent>): HealthEvent {
  return {
    id: 'e',
    kind: 'vaccination',
    status: 'planned',
    date: '2027-03-12',
    clinic: null,
    notes: null,
    items: [],
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
    ...overrides,
  }
}

const item = (id: string, targets: string[], name: string | null = null) => ({ id, name, targets, source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null })

describe('the words of a due date (MR-03.4)', () => {
  const at = (date: string) => dueStatus(ru, date, TODAY)

  it('counts overdue days, and switches to "since" after two months', () => {
    expect(at('2026-09-23')).toEqual({ tone: 'overdue', text: 'Просрочено вчера', day: '23 сентября' })
    expect(at('2026-09-12').text).toBe('Просрочено на 12 дней')
    expect(at('2026-07-24').text).toBe('Просрочено на 62 дня')
    expect(at('2026-07-23').text).toBe('Просрочено с 23 июля')
    // The date is already in the words: not «Просрочено с 23 июля · 23 июля».
    expect(dueLine(at('2026-07-23'))).toBe('Просрочено с 23 июля')
    expect(dueLine(at('2026-09-12'))).toBe('Просрочено на 12 дней · 12 сентября')
  })

  it('says today, tomorrow and "in N days" up to fourteen', () => {
    expect(at('2026-09-24')).toMatchObject({ tone: 'soon', text: 'Сегодня' })
    expect(at('2026-09-25')).toMatchObject({ tone: 'soon', text: 'Завтра' })
    expect(at('2026-10-08')).toMatchObject({ tone: 'soon', text: 'Через 14 дней' })
  })

  it('shows only the date from the fifteenth day on', () => {
    expect(at('2026-10-09')).toEqual({ tone: 'later', text: null, day: '9 октября' })
    expect(at('2027-03-12')).toEqual({ tone: 'later', text: null, day: '12 марта 2027' })
  })

  it('does not jump a day at month ends or across a year', () => {
    expect(dueStatus(ru, '2026-03-01', '2026-02-28').text).toBe('Завтра')
    expect(dueStatus(en, '2027-01-01', '2026-12-31').text).toBe('Tomorrow')
  })
})

describe('due items', () => {
  const events = [
    event({ id: 'p1', date: '2027-03-12', items: [item('a', ['panleukopenia', 'calicivirus', 'rhinotracheitis']), item('b', ['rabies'])] }),
    event({ id: 'p2', date: '2026-09-12', items: [item('c', ['rabies'])] }),
    event({ id: 'd1', status: 'done', date: '2026-03-12', items: [item('x', ['rabies'])] }),
  ]

  it('lists every planned item, overdue first then soonest', () => {
    expect(dueItems(events).map((d) => d.itemId)).toEqual(['c', 'a', 'b'])
  })

  it('names a single-disease item by the disease and a combined one as such', () => {
    expect(itemTitle(ru, item('a', ['rabies'], 'Нобивак Rabies'))).toBe('Бешенство')
    expect(itemTitle(ru, item('b', ['panleukopenia', 'calicivirus']))).toBe('Комплексная прививка')
    expect(itemTitle(ru, item('c', [], 'Своё название'))).toBe('Своё название')
  })

  it('finds the last done vaccination', () => {
    expect(lastDoneDate(events, 'vaccination')).toBe('2026-03-12')
    expect(lastDoneDate([], 'vaccination')).toBeNull()
  })
})

describe('core vaccinations', () => {
  it('shows the next planned date, else the last one, else no records', () => {
    const events = [
      event({ id: 'p', date: '2027-03-12', items: [item('a', ['panleukopenia', 'calicivirus', 'rhinotracheitis'])] }),
      event({ id: 'd', status: 'done', date: '2026-03-12', items: [item('x', ['rabies'])] }),
    ]
    expect(coreStatuses(ru, 'cat', events, TODAY)).toEqual([
      { target: 'panleukopenia', title: 'Панлейкопения', text: 'Следующая — 12 марта 2027', tone: 'later' },
      { target: 'calicivirus', title: 'Калицивироз', text: 'Следующая — 12 марта 2027', tone: 'later' },
      { target: 'rhinotracheitis', title: 'Ринотрахеит', text: 'Следующая — 12 марта 2027', tone: 'later' },
      { target: 'rabies', title: 'Бешенство', text: 'Последняя — 12 марта 2026', tone: 'none' },
    ])
  })

  it('marks an overdue plan in words', () => {
    const events = [event({ date: '2026-09-12', items: [item('a', ['rabies'])] })]
    expect(coreStatuses(ru, 'dog', events, TODAY).find((s) => s.target === 'rabies')).toMatchObject({
      text: 'Просрочено на 12 дней · 12 сентября',
      tone: 'overdue',
    })
  })
})

describe('the form', () => {
  it('offers the same day a year later, and the last day of February for a leap day', () => {
    expect(nextYear('2026-09-24')).toBe('2027-09-24')
    expect(nextYear('2028-02-29')).toBe('2029-02-28')
  })

  it('says what saving will make', () => {
    expect(saveSummary(ru, ['2027-09-24', '2027-09-24'], TODAY)).toBe(
      'После сохранения: одна запись и 2 следующих срока на 24 сентября 2027.',
    )
    expect(saveSummary(ru, ['2027-09-24', null], TODAY)).toBe(
      'После сохранения: одна запись и 1 следующий срок на 24 сентября 2027.',
    )
    expect(saveSummary(ru, ['2027-09-24', '2028-01-01'], TODAY)).toBe(
      'После сохранения: одна запись и 2 следующих срока.',
    )
    expect(saveSummary(ru, [null], TODAY)).toBe('После сохранения: одна запись, без следующих сроков.')
  })
})
