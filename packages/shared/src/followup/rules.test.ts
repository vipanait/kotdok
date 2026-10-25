import { describe, expect, it } from 'vitest'
import type { Urgency } from '@lapka/contracts'
import {
  decideFollowup,
  followupDueTimes,
  followupExpiresAt,
  followupFireMoment,
  followupOfferable,
  followupScheduleFor,
  FollowupAnswerError,
  type FollowupCaseState,
} from './rules'

const HOUR = 60 * 60 * 1000
const checkAt = new Date('2026-10-23T08:00:00Z')
const at = (hours: number) => new Date(checkAt.getTime() + hours * HOUR)

function watching(urgency: Urgency, overrides: Partial<FollowupCaseState> = {}): FollowupCaseState {
  const schedule = followupScheduleFor(urgency)!
  const [first] = followupDueTimes(schedule, checkAt)
  return {
    plan: schedule.plan,
    nextSlot: first!.slot as FollowupCaseState['nextSlot'],
    nextDueAt: first!.dueAt,
    anchorAt: checkAt,
    schedule,
    originUrgency: urgency,
    vetAsks: 0,
    ...overrides,
  }
}

describe('followupScheduleFor', () => {
  it('asks monitor at 12 and 48 hours, on by default', () => {
    expect(followupScheduleFor('monitor')).toEqual({
      plan: 'watch',
      slots: [{ slot: 'mid', afterHours: 12 }, { slot: 'final', afterHours: 48 }],
      defaultEnabled: true,
    })
  })

  it('asks home care at 24 and 72 hours, on by default', () => {
    expect(followupScheduleFor('home_care')?.slots.map((s) => s.afterHours)).toEqual([24, 72])
    expect(followupScheduleFor('home_care')?.defaultEnabled).toBe(true)
  })

  it('asks urgent and emergency about the vet the next day, off by default', () => {
    for (const urgency of ['urgent', 'emergency'] as const) {
      expect(followupScheduleFor(urgency)).toEqual({ plan: 'vet', slots: [{ slot: 'vet', afterHours: 24 }], defaultEnabled: false })
    }
  })

  it('does not watch a healthy pet', () => {
    expect(followupScheduleFor('healthy')).toBeNull()
  })
})

describe('followupOfferable', () => {
  const check = { urgency: 'monitor' as Urgency, petId: 'pet', createdAt: checkAt }

  it('offers within twelve hours of a check with a pet', () => {
    expect(followupOfferable(check, at(11.9))).toBe(true)
    expect(followupOfferable(check, at(12))).toBe(false)
  })

  it('offers nothing without a pet or for healthy', () => {
    expect(followupOfferable({ ...check, petId: null }, at(1))).toBe(false)
    expect(followupOfferable({ ...check, urgency: 'healthy' }, at(1))).toBe(false)
  })
})

describe('followupFireMoment', () => {
  const local = (h: number, m = 0, day = 23) => new Date(2026, 9, day, h, m)

  it('leaves a daytime moment alone', () => {
    expect(followupFireMoment(local(14, 30))).toEqual(local(14, 30))
    expect(followupFireMoment(local(9, 0))).toEqual(local(9, 0))
    expect(followupFireMoment(local(20, 59))).toEqual(local(20, 59))
  })

  it('moves a late evening moment to 09:00 the next day', () => {
    expect(followupFireMoment(local(21, 0))).toEqual(local(9, 0, 24))
    expect(followupFireMoment(local(23, 30))).toEqual(local(9, 0, 24))
  })

  it('moves a small-hours moment to 09:00 the same day', () => {
    expect(followupFireMoment(local(3, 0))).toEqual(local(9, 0))
    expect(followupFireMoment(local(0, 0))).toEqual(local(9, 0))
  })

  it('keeps the calendar day across the end of a month', () => {
    expect(followupFireMoment(new Date(2026, 9, 31, 22, 0))).toEqual(new Date(2026, 10, 1, 9, 0))
  })

  it('lands on 09:00 local across a daylight-saving change', () => {
    // Whatever the zone the tests run in, the result is 09:00 on its own clock.
    const fire = followupFireMoment(new Date(2026, 2, 28, 23, 0))
    expect([fire.getDate(), fire.getHours(), fire.getMinutes()]).toEqual([29, 9, 0])
  })
})

describe('decideFollowup — watching', () => {
  it('closes on «better» at any point', () => {
    for (const hours of [2, 13, 50]) {
      const verdict = decideFollowup(watching('monitor'), { state: 'better' }, at(hours))
      expect(verdict).toMatchObject({ decision: 'close_improved', outcome: 'improved', next: null, escalation: 'none' })
    }
  })

  it('keeps watching on «same» at the mid question, keeping the final time from the check', () => {
    const verdict = decideFollowup(watching('monitor'), { state: 'same' }, at(13))
    expect(verdict.slot).toBe('mid')
    expect(verdict.decision).toBe('keep_watching')
    expect(verdict.next).toEqual({ slot: 'final', dueAt: at(48) })
  })

  it('sends to a vet on «same» at the final question', () => {
    const state = watching('monitor', { nextSlot: 'final', nextDueAt: at(48) })
    const verdict = decideFollowup(state, { state: 'same' }, at(49))
    expect(verdict).toMatchObject({ slot: 'final', decision: 'see_vet', escalation: 'see_vet', outcome: null })
    expect(verdict.next).toEqual({ slot: 'vet', dueAt: at(49 + 24) })
  })

  it('counts a late answer for the latest question that came, not the missed one', () => {
    const verdict = decideFollowup(watching('home_care'), { state: 'same' }, at(80))
    expect(verdict).toMatchObject({ slot: 'final', decision: 'see_vet' })
  })

  it('sends to a vet today on «worse», whenever it comes', () => {
    for (const hours of [1, 25, 75]) {
      const verdict = decideFollowup(watching('home_care'), { state: 'worse' }, at(hours))
      expect(verdict).toMatchObject({ decision: 'see_vet_today', escalation: 'see_vet_today', outcome: null })
      expect(verdict.next).toEqual({ slot: 'vet', dueAt: at(hours + 24) })
    }
  })

  it('treats an answer before any question as early: «same» changes nothing', () => {
    const state = watching('monitor')
    const verdict = decideFollowup(state, { state: 'same' }, at(3))
    expect(verdict).toMatchObject({ slot: 'extra', decision: 'keep_watching' })
    expect(verdict.next).toEqual({ slot: 'mid', dueAt: at(12) })
  })

  it('does not count the mid question twice: after it, «same» before 48 hours is early', () => {
    const state = watching('monitor', { nextSlot: 'final', nextDueAt: at(48) })
    const verdict = decideFollowup(state, { state: 'same' }, at(30))
    expect(verdict).toMatchObject({ slot: 'extra', decision: 'keep_watching' })
    expect(verdict.next).toEqual({ slot: 'final', dueAt: at(48) })
  })

  it('refuses a vet answer when the case does not ask about the vet', () => {
    expect(() => decideFollowup(watching('monitor'), { state: 'same', vetVisited: true }, at(13))).toThrow(FollowupAnswerError)
  })
})

describe('decideFollowup — asking about the vet', () => {
  const asking = (urgency: Urgency, vetAsks = 0) =>
    watching(urgency, { nextSlot: 'vet', nextDueAt: at(24), vetAsks })

  it('requires the vet answer', () => {
    expect(() => decideFollowup(asking('urgent'), { state: 'same' }, at(25))).toThrow(FollowupAnswerError)
  })

  it('closes as vet_seen on «yes», whatever the state', () => {
    for (const state of ['better', 'same', 'worse'] as const) {
      expect(decideFollowup(asking('urgent'), { state, vetVisited: true }, at(25))).toMatchObject({
        decision: 'vet_seen',
        outcome: 'vet_seen',
        next: null,
      })
    }
  })

  it('closes as improved on «not yet» and «better»', () => {
    expect(decideFollowup(asking('emergency'), { state: 'better', vetVisited: false }, at(25))).toMatchObject({
      decision: 'close_improved',
      outcome: 'improved',
    })
  })

  it('sends urgent to a vet today and asks again tomorrow', () => {
    const verdict = decideFollowup(asking('urgent'), { state: 'same', vetVisited: false }, at(25))
    expect(verdict).toMatchObject({ decision: 'see_vet_today', escalation: 'see_vet_today', outcome: null, vetAsks: 1 })
    expect(verdict.next).toEqual({ slot: 'vet', dueAt: at(49) })
  })

  it('sends emergency to a clinic now', () => {
    expect(decideFollowup(asking('emergency'), { state: 'worse', vetVisited: false }, at(25))).toMatchObject({
      decision: 'clinic_now',
      escalation: 'clinic_now',
    })
  })

  it('stops asking after the second «not yet»', () => {
    const verdict = decideFollowup(asking('urgent', 1), { state: 'worse', vetVisited: false }, at(50))
    expect(verdict).toMatchObject({ decision: 'see_vet_today', outcome: 'unresolved', next: null, vetAsks: 2 })
  })

  it('asks a monitor case escalated by the rule about the vet like an urgent one', () => {
    const verdict = decideFollowup(asking('monitor'), { state: 'same', vetVisited: false }, at(73))
    expect(verdict.decision).toBe('see_vet_today')
  })
})

describe('followupExpiresAt', () => {
  it('is a week after the last question', () => {
    expect(followupExpiresAt(at(48))).toEqual(at(48 + 7 * 24))
  })
})
