import { afterEach, describe, expect, it } from 'vitest'
import type { DueItem } from '@lapka/contracts'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { DEFAULT_REMINDERS, REMINDER_LIMIT, planReminders, reminderMoment } from './schedule'

const MURKA = '11111111-1111-4111-8111-000000000001'
const BOBIK = '11111111-1111-4111-8111-000000000002'
const pets = [
  { id: MURKA, name: 'Мурка' },
  { id: BOBIK, name: 'Бобик' },
]

let counter = 0
function due(overrides: Partial<DueItem>): DueItem {
  counter += 1
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
  return { pet_id: MURKA, event_id: id, item_id: id, kind: 'vaccination', date: '2026-10-10', name: null, targets: ['rabies'], ...overrides }
}

// 24 September 2026, noon on the phone.
const NOW = new Date(2026, 8, 24, 12, 0)

describe('what the phone is told to show', () => {
  it('reminds before, on the day and a week after, at the chosen hour (spec §7.21)', () => {
    const plan = planReminders(ru, [due({})], pets, DEFAULT_REMINDERS, NOW)
    expect(plan.map((r) => [r.day, r.hour, r.body])).toEqual([
      ['2026-10-07', 10, 'Мурке через 3 дня: прививка от бешенства'],
      ['2026-10-10', 10, 'Сегодня у Мурки: прививка от бешенства'],
      ['2026-10-17', 10, 'Мурке пора: прививка от бешенства просрочена на неделю'],
    ])
    expect(plan.every((r) => r.title === 'Лапка' && r.petId === MURKA)).toBe(true)
  })

  it('names treatments and visits the way people say them', () => {
    const today = (item: Partial<DueItem>) => planReminders(ru, [due({ date: '2026-09-30', ...item })], pets, { ...DEFAULT_REMINDERS, daysBefore: 7 }, NOW)[0]?.body
    expect(today({ kind: 'parasite', targets: ['fleas', 'ticks'] })).toBe('Сегодня у Мурки: обработка от блох и клещей')
    expect(today({ kind: 'parasite', targets: ['worms'] })).toBe('Сегодня у Мурки: обработка от глистов')
    expect(today({ kind: 'vaccination', targets: ['panleukopenia', 'calicivirus'] })).toBe('Сегодня у Мурки: комплексная прививка')
    expect(today({ kind: 'vaccination', targets: [], name: 'Нобивак DHPPi' })).toBe('Сегодня у Мурки: прививка «Нобивак DHPPi»')
    expect(today({ kind: 'visit', targets: [] })).toBe('Сегодня у Мурки: визит к врачу')
  })

  it('gives two plans of one pet on one day a single notification (MR-08.2)', () => {
    const plan = planReminders(ru, [due({ targets: ['rabies'] }), due({ targets: ['felv'] })], pets, DEFAULT_REMINDERS, NOW)
    const onTheDay = plan.filter((r) => r.day === '2026-10-10')
    expect(onTheDay).toHaveLength(1)
    expect(onTheDay[0].body).toBe('Сегодня у Мурки: 2 прививки')
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length)
  })

  it('counts different kinds as due dates, and keeps two pets apart', () => {
    const plan = planReminders(
      ru,
      [due({}), due({ kind: 'parasite', targets: ['worms'] }), due({ pet_id: BOBIK })],
      pets,
      DEFAULT_REMINDERS,
      NOW,
    )
    const onTheDay = plan.filter((r) => r.day === '2026-10-10')
    expect(onTheDay.map((r) => r.body).sort()).toEqual(['Сегодня у Бобика: прививка от бешенства', 'Сегодня у Мурки: 2 срока'])
  })

  it('puts two phases falling on one day into one notification', () => {
    // Rabies today, worms in 3 days: both on 10 October.
    const plan = planReminders(ru, [due({}), due({ kind: 'parasite', targets: ['worms'], date: '2026-10-13' })], pets, DEFAULT_REMINDERS, NOW)
    const onTheDay = plan.filter((r) => r.day === '2026-10-10')
    expect(onTheDay).toHaveLength(1)
    expect(onTheDay[0].body).toBe('Сегодня у Мурки: прививка от бешенства\nМурке через 3 дня: обработка от глистов')
  })

  it('keeps the nearest 64 of 70 (MR-08.2)', () => {
    const many = Array.from({ length: 70 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10)
      return due({ date: day })
    })
    const plan = planReminders(ru, many, pets, { ...DEFAULT_REMINDERS, daysBefore: 1 }, NOW)
    expect(plan).toHaveLength(REMINDER_LIMIT)
    expect(REMINDER_LIMIT).toBe(64)
    const days = plan.map((r) => r.day)
    expect(days).toEqual([...days].sort())
    expect(days[0]).toBe('2026-09-30')
  })

  it('drops what has already passed, and nothing is planned when turned off', () => {
    // Due tomorrow: «in 3 days» has passed, the day itself and the week after remain.
    const plan = planReminders(ru, [due({ date: '2026-09-25' })], pets, DEFAULT_REMINDERS, NOW)
    expect(plan.map((r) => r.day)).toEqual(['2026-09-25', '2026-10-02'])
    // Today at 10:00 is already past at noon.
    expect(planReminders(ru, [due({ date: '2026-09-24' })], pets, DEFAULT_REMINDERS, NOW).map((r) => r.day)).toEqual(['2026-10-01'])
    expect(planReminders(ru, [due({})], pets, { ...DEFAULT_REMINDERS, enabled: false }, NOW)).toEqual([])
  })

  it('skips a pet that is not in the list any more', () => {
    expect(planReminders(ru, [due({ pet_id: '99999999-9999-4999-8999-999999999999' })], pets, DEFAULT_REMINDERS, NOW)).toEqual([])
  })

  it('uses a plain form for a name it cannot decline, and speaks English', () => {
    const tobi = planReminders(ru, [due({ date: '2026-09-30' })], [{ id: MURKA, name: 'Тоби' }], DEFAULT_REMINDERS, NOW)
    expect(tobi.map((r) => r.body)).toEqual(['Тоби — через 3 дня: прививка от бешенства', 'Тоби — сегодня: прививка от бешенства', 'Тоби — пора: прививка от бешенства просрочена на неделю'])
    const english = planReminders(en, [due({ date: '2026-09-26' }), due({ date: '2026-09-28', kind: 'parasite', targets: ['fleas', 'ticks'] })], [{ id: MURKA, name: 'Murka' }], { ...DEFAULT_REMINDERS, daysBefore: 1 }, NOW)
    expect(english.map((r) => r.body)).toEqual([
      'Murka tomorrow: rabies vaccination',
      'Today for Murka: rabies vaccination',
      'Murka tomorrow: flea and tick treatment',
      'Today for Murka: flea and tick treatment',
      'Murka is due: rabies vaccination, a week overdue',
      'Murka is due: flea and tick treatment, a week overdue',
    ])
    expect(english[0].title).toBe('Lapka')
  })
})

describe('calendar days stay put (MR-08.4)', () => {
  const zone = process.env.TZ
  afterEach(() => {
    process.env.TZ = zone
  })

  it('fires at the hour on the wall clock across a daylight saving change', () => {
    process.env.TZ = 'America/New_York'
    // Clocks go back on 1 November 2026; the reminder is still at 10:00 that day.
    const at = reminderMoment('2026-11-01', 10)
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 11, 1, 10, 0])
    process.env.TZ = 'Europe/Berlin'
    const spring = reminderMoment('2027-03-28', 8)
    expect([spring.getDate(), spring.getHours()]).toEqual([28, 8])
  })

  it('keeps a due date at midnight and east or west of UTC on its day', () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Vladivostok', 'UTC']) {
      process.env.TZ = tz
      const justAfterMidnight = new Date(2026, 9, 10, 0, 5)
      const plan = planReminders(ru, [due({ date: '2026-10-10' })], pets, DEFAULT_REMINDERS, justAfterMidnight)
      expect(plan.map((r) => r.day), tz).toEqual(['2026-10-10', '2026-10-17'])
    }
  })
})
