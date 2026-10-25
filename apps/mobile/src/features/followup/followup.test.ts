import { describe, expect, it, vi } from 'vitest'
import type { FollowupCaseSummary } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { en } from '@/i18n/en'
import { DEFAULT_REMINDERS } from '@/features/medical-record/reminders/schedule'
import { createReminderSync, openTarget, type Notifier } from '@/features/medical-record/reminders/sync'
import { planFollowupReminders } from './followup-reminders'
import { askWhen, caseHref, dueCards, isDue, oneRowPerCase, tomorrowMorning } from './followup-ui'
import { askRecheck, takeRecheck } from './recheck-request'

vi.mock('react-native', () => ({}))

const PET = '11111111-1111-4111-8111-000000000001'
const OTHER_PET = '22222222-2222-4222-8222-000000000001'
const CASE = '33333333-3333-4333-8333-000000000001'
const NOW = new Date(2026, 9, 25, 12, 0)
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString()

function summary(overrides: Partial<FollowupCaseSummary> = {}): FollowupCaseSummary {
  return {
    id: CASE,
    pet_id: PET,
    pet_name: 'Мурка',
    pet_species: 'cat',
    origin_check_id: CASE,
    origin_checked_at: at(25, 9),
    origin_urgency: 'monitor',
    current_urgency: 'monitor',
    anchor_at: at(25, 9),
    symptoms: 'рвота',
    plan: 'watch',
    status: 'active',
    next_slot: 'mid',
    next_due_at: at(25, 21),
    escalation: 'none',
    outcome: null,
    hidden_until: null,
    saved_to_record_at: null,
    checkin_count: 0,
    closed_at: null,
    created_at: at(25, 9),
    ...overrides,
  }
}

describe('when the phone will ask', () => {
  it('moves a night question to 09:00 and words it from today', () => {
    expect(askWhen(ru, at(25, 21), NOW)).toBe('завтра в 09:00')
    expect(askWhen(ru, at(25, 15, 30), NOW)).toBe('сегодня в 15:30')
    expect(askWhen(ru, at(27, 10), NOW)).toBe('27 октября в 10:00')
    expect(askWhen(en, at(26, 3), NOW)).toBe('tomorrow at 09:00')
  })

  it('hides until tomorrow at 09:00', () => {
    expect(tomorrowMorning(NOW)).toEqual(new Date(2026, 9, 26, 9, 0))
  })
})

describe('cards on the pet list', () => {
  it('shows a case only once its question has come, and not while hidden', () => {
    expect(isDue(summary({ next_due_at: at(25, 11) }), NOW)).toBe(true)
    expect(isDue(summary({ next_due_at: at(25, 13) }), NOW)).toBe(false)
    expect(isDue(summary({ next_due_at: at(25, 11), hidden_until: at(26, 9) }), NOW)).toBe(false)
    expect(isDue(summary({ next_due_at: at(25, 11), status: 'closed' }), NOW)).toBe(false)
  })

  it('brings up one card per pet, the earliest question first', () => {
    const cards = dueCards(
      [
        summary({ id: 'b', next_due_at: at(25, 10) }),
        summary({ id: 'a', next_due_at: at(25, 8) }),
        summary({ id: 'c', pet_id: OTHER_PET, next_due_at: at(25, 9) }),
      ],
      NOW,
    )
    expect(cards.map((card) => card.id)).toEqual(['a', 'c'])
  })
})

describe('the history', () => {
  it('keeps the newest check of a case and every check in no case', () => {
    const rows = oneRowPerCase([
      { id: 'recheck', followup: { case_id: 'k' } },
      { id: 'lonely', followup: null },
      { id: 'origin', followup: { case_id: 'k' } },
      { id: 'older' },
    ])
    expect(rows.map((row) => row.id)).toEqual(['recheck', 'lonely', 'older'])
  })

  it('opens a case in the tab it was found in', () => {
    expect(caseHref('pets', PET, CASE)).toBe(`/pets/${PET}/case/${CASE}`)
    expect(caseHref('profile', PET, CASE, 'checkin', { from: 'timeline' })).toBe(`/profile/case/${CASE}/checkin?from=timeline`)
    expect(caseHref('check', PET, CASE, 'checkin', { state: 'worse', from: 'pets_list' })).toBe(
      `/check/case/${CASE}/checkin?state=worse&from=pets_list`,
    )
  })
})

describe('notifications for open cases', () => {
  it('asks at the night-moved moment, about the vet when that is the question, without symptoms', () => {
    const [watch] = planFollowupReminders(ru, [summary()], NOW)
    expect(watch).toMatchObject({ day: '2026-10-26', hour: 9, minute: 0, body: 'Как Мурка? Отметьте, стало ли лучше', data: { kind: 'followup', caseId: CASE } })
    expect(watch!.body).not.toContain('рвота')
    const [vet] = planFollowupReminders(ru, [summary({ next_slot: 'vet', next_due_at: at(26, 14) })], NOW)
    expect(vet!.body).toBe('Как Мурка? Расскажите, были ли у врача')
  })

  it('plans every question still ahead, not only the pending one', () => {
    const planned = planFollowupReminders(ru, [summary()], NOW)
    expect(planned.map((r) => [r.id.split('-').at(-1), r.day, r.hour])).toEqual([
      ['mid', '2026-10-26', 9],
      ['final', '2026-10-27', 9],
    ])
    // Past the first question, only the second is left; a vet question stands alone.
    expect(planFollowupReminders(ru, [summary({ next_slot: 'final', next_due_at: at(27, 9) })], NOW)).toHaveLength(1)
    expect(planFollowupReminders(ru, [summary({ next_slot: 'vet', next_due_at: at(26, 14) })], NOW)).toHaveLength(1)
  })

  it('waits for a hidden case, and does not ring a question that already passed', () => {
    const [hidden] = planFollowupReminders(ru, [summary({ next_due_at: at(25, 11), hidden_until: at(26, 9) })], NOW)
    expect(hidden).toMatchObject({ day: '2026-10-26', hour: 9 })
    // The pending question passed and rang; the second one is still to come.
    expect(planFollowupReminders(ru, [summary({ next_due_at: at(25, 11) })], NOW).map((r) => r.id.split('-').at(-1))).toEqual(['final'])
  })

  it('come first within the phone’s limit, and open the answer for its owner only', async () => {
    const scheduled = new Map<string, Record<string, string>>()
    const notifier: Notifier = {
      granted: async () => true,
      cancelAll: async () => scheduled.clear(),
      dismissAll: async () => {},
      schedule: async (reminder, data) => void scheduled.set(reminder.id, data as Record<string, string>),
    }
    const sync = createReminderSync({ notifier, settings: async () => DEFAULT_REMINDERS, t: () => ru, now: () => NOW })
    const courses = Array.from({ length: 4 }, (_, index) => ({
      pet: { id: PET, name: 'Мурка' },
      course: { id: `c${index}`, name: 'Нефростоп', dosage: null, started_on: '2026-09-01', ended_on: null, ongoing: true, source: 'record' as const, reminder_times: ['08:00', '13:00', '18:00', '22:00'] },
    }))
    const late = summary({ next_due_at: at(31, 10) })
    await sync.run({ userId: 'user-a', load: async () => ({ due: [], pets: [{ id: PET, name: 'Мурка' }], courses, doses: [], followups: [late] }) })

    expect(scheduled.size).toBe(64)
    expect(scheduled.has(`lapka-followup-${CASE}-final`)).toBe(true)
    const data = scheduled.get(`lapka-followup-${CASE}-mid`)
    expect(data).toEqual({ petId: PET, userId: 'user-a', kind: 'followup', caseId: CASE })
    expect(openTarget(data, 'user-a', [{ id: PET }])).toBe(`/pets/${PET}/case/${CASE}/checkin?from=notification`)
    expect(openTarget(data, 'user-b', [{ id: PET }])).toBe('/pets')
    expect(openTarget({ ...data, caseId: 'not-a-uuid' }, 'user-a', [{ id: PET }])).toBe(`/pets/${PET}`)
  })

  it('are all gone when reminders are off on this phone', async () => {
    const scheduled = new Set<string>()
    const notifier: Notifier = {
      granted: async () => true,
      cancelAll: async () => scheduled.clear(),
      dismissAll: async () => {},
      schedule: async (reminder) => void scheduled.add(reminder.id),
    }
    const sync = createReminderSync({ notifier, settings: async () => ({ ...DEFAULT_REMINDERS, enabled: false }), t: () => ru, now: () => NOW })
    await sync.run({ userId: 'user-a', load: async () => ({ due: [], pets: [], followups: [summary()] }) })
    expect(scheduled.size).toBe(0)
  })
})

describe('a re-check asked for from an outcome', () => {
  it('reaches the check tab once, the latest request winning', () => {
    askRecheck({ caseId: 'old', petId: OTHER_PET })
    askRecheck({ caseId: CASE, petId: PET })
    expect(takeRecheck()).toEqual({ caseId: CASE, petId: PET })
    expect(takeRecheck()).toBeNull()
  })
})

describe('texts', () => {
  it('declines a name it is sure of and stays neutral otherwise', () => {
    expect(ru.followup.improvedTitle('Мурка')).toBe('Рады, что Мурке лучше')
    expect(ru.followup.todayTitle('Барсик')).toBe('Покажите Барсика врачу сегодня')
    expect(ru.followup.todayTitle('Max')).toBe('Покажитесь врачу сегодня')
    expect(ru.followup.seeVetTitle('Пушок')).toBe('Стоит показаться врачу')
  })
})
