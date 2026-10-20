import { describe, expect, it } from 'vitest'
import type { Medication } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { doseMoments, planDoseReminders, planDoseRenewal, todayDoses } from './doses'
import { REMINDER_LIMIT } from './schedule'

const course = (overrides: Partial<Medication> = {}): Medication => ({
  id: 'c1',
  name: 'Нефростоп',
  dosage: '1 таблетка',
  started_on: '2026-10-01',
  ended_on: null,
  ongoing: true,
  source: 'record',
  reminder_times: ['08:00', '20:00'],
  ...overrides,
})

const pet = { id: 'p1', name: 'Мурка' }
// 20 October 2026, 12:00 on the phone's clock.
const NOW = new Date(2026, 9, 20, 12, 0)

describe('the doses ahead (FB-5/03)', () => {
  it('lists each time of each day while the course runs, from now on', () => {
    const moments = doseMoments([{ pet, course: course() }], [], NOW, 2)
    expect(moments.map((moment) => `${moment.day} ${moment.slot}`)).toEqual(['2026-10-20 20:00', '2026-10-21 08:00', '2026-10-21 20:00'])
  })

  it('leaves out a dose already given, and the days after the course ended', () => {
    const given = [{ medication_id: 'c1', taken_on: '2026-10-20', slot: '20:00' }]
    expect(doseMoments([{ pet, course: course() }], given, NOW, 1)).toEqual([])
    const ended = course({ ongoing: false, ended_on: '2026-10-19' })
    expect(doseMoments([{ pet, course: ended }], [], NOW, 3)).toEqual([])
  })

  it('reminds on the course’s last day too: «до 20 октября» includes the 20th', () => {
    const lastDay = course({ ongoing: false, ended_on: '2026-10-20' })
    expect(doseMoments([{ pet, course: lastDay }], [], NOW, 3).map((moment) => `${moment.day} ${moment.slot}`)).toEqual(['2026-10-20 20:00'])
    expect(todayDoses([lastDay], [], NOW).map((dose) => dose.slot)).toEqual(['08:00', '20:00'])
  })

  it('does not remind before the course starts', () => {
    const later = course({ started_on: '2026-10-22' })
    expect(doseMoments([{ pet, course: later }], [], NOW, 3).map((moment) => moment.day)).toEqual(['2026-10-22', '2026-10-22'])
  })

  it('fires on the wall clock, whatever the offset', () => {
    const [first] = doseMoments([{ pet, course: course() }], [], NOW, 1)
    expect(first.at.getHours()).toBe(20)
    expect(first.at.getMinutes()).toBe(0)
  })

  it('names the pet and the medicine', () => {
    const [reminder] = planDoseReminders(ru, [{ pet, course: course() }], [], NOW)
    expect(reminder).toMatchObject({ id: 'lapka-dose-c1-2026-10-20-20:00', petId: 'p1', day: '2026-10-20', hour: 20, minute: 0 })
    expect(reminder.body).toBe('Мурке пора: Нефростоп, 1 таблетка')
  })

  it('keeps within the phone’s limit, nearest first', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ pet, course: course({ id: `c${index}`, reminder_times: ['08:00', '14:00', '20:00', '23:00'] }) }))
    const plan = planDoseReminders(ru, many, [], NOW)
    expect(plan).toHaveLength(REMINDER_LIMIT)
    expect(plan[0].day).toBe('2026-10-20')
  })
})

describe('today’s doses on the pet card (FB-5/04)', () => {
  it('shows each time with whether it was given or is past', () => {
    const given = [{ medication_id: 'c1', taken_on: '2026-10-20', slot: '08:00' }]
    expect(todayDoses([course()], given, NOW)).toEqual([
      { course: expect.objectContaining({ id: 'c1' }), slot: '08:00', state: 'given' },
      { course: expect.objectContaining({ id: 'c1' }), slot: '20:00', state: 'due' },
    ])
    expect(todayDoses([course()], [], NOW)[0].state).toBe('missed')
  })
})

describe('the week’s end, when the app was not opened (PR #82 review)', () => {
  it('adds «откройте Лапку» a minute after the last dose held, while the course runs on', () => {
    const planned = planDoseReminders(ru, [{ pet, course: course() }], [], NOW)
    const renewal = planDoseRenewal(ru, [{ pet, course: course() }], [], NOW, planned)
    const last = planned[planned.length - 1]
    expect(renewal).toMatchObject({ id: 'lapka-dose-renew', petId: 'p1', day: last.day, hour: 20, minute: 1 })
    expect(renewal!.body).toContain('Откройте «Лапку»')
  })

  it('says nothing when the course ends within the week, or nothing is held', () => {
    const ending = course({ ongoing: false, ended_on: '2026-10-22' })
    const planned = planDoseReminders(ru, [{ pet, course: ending }], [], NOW)
    expect(planDoseRenewal(ru, [{ pet, course: ending }], [], NOW, planned)).toBeNull()
    expect(planDoseRenewal(ru, [{ pet, course: course() }], [], NOW, [])).toBeNull()
  })
})
