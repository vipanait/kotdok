import { describe, expect, it } from 'vitest'
import type { PastEpisode } from '@lapka/contracts'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import {
  answerLabel,
  caseSpan,
  caseStatusLabel,
  caseTimeline,
  checkinSource,
  decisionTone,
  dueBanners,
  entryChecks,
  followupHref,
  formatDayRange,
  formatWhen,
  groupHistory,
  nextQuestionWhen,
  offerPlacement,
  offerSentence,
  parseAnswer,
  partOfCase,
  petLineOf,
  recentEpisodes,
  recheckPlaque,
  sinceCheck,
  tomorrowMorning,
} from '@/features/followup/followup-view'
import { CASE, ORIGIN, OTHER_PET, RECHECK, check, fullCase, link, summary } from './demo-cases'

const words = ru.followup
const UTC = 'UTC'

describe('the reminder on a result', () => {
  it('says the schedule of the check’s level and stands where the design puts it', () => {
    expect(offerSentence(words, 'monitor')).toBe(words.offerWatch12)
    expect(offerSentence(words, 'home_care')).toBe(words.offerWatch24)
    expect(offerSentence(words, 'urgent')).toBe(words.offerVet)
    expect(offerSentence(words, 'emergency')).toBe(words.offerVet)
    expect(offerSentence(words, 'healthy')).toBeNull()

    expect(offerPlacement('monitor')).toBe('top')
    expect(offerPlacement('home_care')).toBe('top')
    expect(offerPlacement('urgent')).toBe('bottom')
    expect(offerPlacement('emergency')).toBe('bottom')
    // Nothing to watch: no card at all.
    expect(offerPlacement('healthy')).toBeNull()
  })

  it('names the case of a re-check with its date and answers', () => {
    expect(partOfCase(words, summary({ checkin_count: 2 }), 'ru', UTC)).toBe('Часть случая от 23 октября · 2 отметки')
    expect(partOfCase(words, summary({ checkin_count: 0 }), 'ru', UTC)).toBe('Часть случая от 23 октября')
    expect(partOfCase(en.followup, summary({ checkin_count: 1 }), 'en', UTC)).toBe('Part of the case from October 23 · 1 check-in')
  })
})

describe('the overview’s banners', () => {
  const now = new Date('2026-10-24T10:00:00.000Z')

  it('shows a case only once its question has come, and not while it is hidden', () => {
    const due = summary({ id: 'a', next_due_at: '2026-10-24T09:00:00.000Z' })
    const early = summary({ id: 'b', pet_id: OTHER_PET, next_due_at: '2026-10-24T11:00:00.000Z' })
    const hidden = summary({ id: 'c', pet_id: 'p3', next_due_at: '2026-10-24T08:00:00.000Z', hidden_until: '2026-10-25T06:00:00.000Z' })
    const hiddenPast = summary({ id: 'd', pet_id: 'p4', next_due_at: '2026-10-24T08:30:00.000Z', hidden_until: '2026-10-24T06:00:00.000Z' })
    const closed = summary({ id: 'e', pet_id: 'p5', status: 'closed', next_due_at: null, outcome: 'improved' })
    expect(dueBanners([due, early, hidden, hiddenPast, closed], now).map((item) => item.id)).toEqual(['d', 'a'])
  })

  it('puts the earliest question first, one banner per pet', () => {
    const later = summary({ id: 'late', next_due_at: '2026-10-24T09:00:00.000Z' })
    const sooner = summary({ id: 'soon', pet_id: OTHER_PET, next_due_at: '2026-10-23T09:00:00.000Z' })
    const samePet = summary({ id: 'dup', next_due_at: '2026-10-24T09:30:00.000Z' })
    expect(dueBanners([later, sooner, samePet], now).map((item) => item.id)).toEqual(['soon', 'late'])
  })

  it('hides until 09:00 of the next day on the browser’s clock', () => {
    const at = new Date(2026, 9, 24, 22, 15)
    const until = tomorrowMorning(at)
    expect([until.getFullYear(), until.getMonth(), until.getDate(), until.getHours(), until.getMinutes()]).toEqual([2026, 9, 25, 9, 0])
  })

  it('opens the check-in page with the answer chosen, never saving it', () => {
    expect(followupHref.checkin(CASE, { answer: 'worse', from: 'banner' })).toBe(`/checks/case/${CASE}/checkin?answer=worse&from=banner`)
    expect(followupHref.checkin(CASE)).toBe(`/checks/case/${CASE}/checkin`)
    expect(parseAnswer('worse')).toBe('worse')
    expect(parseAnswer('much-better')).toBeNull()
    expect(parseAnswer(['better'])).toBeNull()
    expect(checkinSource('banner')).toBe('web_banner')
    expect(checkinSource('record')).toBe('pet_card')
    expect(checkinSource(undefined)).toBe('timeline')
    expect(checkinSource('notification')).toBe('timeline')
  })
})

describe('times in words', () => {
  it('says today, tomorrow or the date, on one clock', () => {
    const now = new Date('2026-10-24T10:00:00.000Z')
    expect(formatWhen(new Date('2026-10-24T15:00:00.000Z'), now, 'ru', words, UTC)).toBe('сегодня в 15:00')
    expect(formatWhen(new Date('2026-10-25T09:00:00.000Z'), now, 'ru', words, UTC)).toBe('завтра в 09:00')
    expect(formatWhen(new Date('2026-10-27T09:00:00.000Z'), now, 'ru', words, UTC)).toBe('27 октября в 09:00')
    expect(formatWhen(new Date('2026-10-25T09:00:00.000Z'), now, 'en', en.followup, UTC)).toBe('tomorrow at 09:00 AM')
  })

  it('moves a question due at night to 09:00 on the browser’s clock (the shared rule)', () => {
    const now = new Date(2026, 9, 24, 20, 0)
    const lateEvening = new Date(2026, 9, 24, 23, 30).toISOString()
    expect(nextQuestionWhen(lateEvening, now, 'ru', words)).toBe('завтра в 09:00')
    const afternoon = new Date(2026, 9, 25, 14, 0).toISOString()
    expect(nextQuestionWhen(afternoon, now, 'ru', words)).toBe('завтра в 14:00')
  })

  it('writes a case’s dates as one range', () => {
    expect(formatDayRange('2026-10-23T06:00:00Z', '2026-10-25T06:00:00Z', 'ru', UTC)).toBe('23–25 октября')
    expect(formatDayRange('2026-10-23T06:00:00Z', '2026-10-23T18:00:00Z', 'ru', UTC)).toBe('23 октября')
    expect(formatDayRange('2026-09-30T06:00:00Z', '2026-10-02T06:00:00Z', 'ru', UTC)).toBe('30 сентября – 2 октября')
    expect(formatDayRange('2026-10-23T06:00:00Z', '2026-10-25T06:00:00Z', 'en', UTC)).toBe('October 23–25')
  })

  it('counts «прошло 2 дня» from the check the schedule counted from', () => {
    const now = new Date('2026-10-25T06:00:00.000Z')
    expect(sinceCheck('2026-10-23T06:00:00.000Z', now, words, 'ru')).toBe('2 дня')
    expect(sinceCheck('2026-10-24T18:00:00.000Z', now, words, 'ru')).toBe('12 часов')
  })
})

describe('the outcome', () => {
  it('only colours what the server decided', () => {
    expect(decisionTone('see_vet')).toBe('vet')
    expect(decisionTone('see_vet_today')).toBe('vet')
    expect(decisionTone('clinic_now')).toBe('vet')
    expect(decisionTone('close_improved')).toBe('calm')
    expect(decisionTone('keep_watching')).toBe('calm')
    expect(decisionTone('vet_seen')).toBe('calm')
  })

  it('names the answer in words, the vet answer first', () => {
    expect(answerLabel(words, { state: 'better', vet_visited: null })).toBe('Лучше')
    expect(answerLabel(words, { state: 'worse', vet_visited: true })).toBe('Да, были у врача')
    expect(answerLabel(words, { state: 'same', vet_visited: false })).toBe('Ещё не были у врача · Так же')
  })

  it('says «Наблюдаем» while open and the outcome once closed', () => {
    expect(caseStatusLabel(words, { status: 'active', outcome: null })).toBe('Наблюдаем')
    expect(caseStatusLabel(words, { status: 'closed', outcome: 'improved' })).toBe('Стало лучше')
    expect(caseStatusLabel(words, { status: 'closed', outcome: 'expired' })).toBe('Без ответа')
  })
})

describe('the history', () => {
  it('collapses a case’s checks into the place of its newest one; other checks stay rows', () => {
    const recheck = check(RECHECK, '2026-10-24T09:00:00.000Z', { urgency: 'home_care' })
    const lone = check('44444444-4444-4444-8444-000000000001', '2026-10-23T12:00:00.000Z')
    const origin = check(ORIGIN, '2026-10-23T06:00:00.000Z')
    const offCase = check('44444444-4444-4444-8444-000000000002', '2026-10-20T06:00:00.000Z')
    const links = new Map([
      [RECHECK, link({ kind: 'recheck' })],
      [ORIGIN, link()],
      [offCase.id, link({ case_id: '22222222-2222-4222-8222-000000000009', status: 'off' })],
    ])
    const entries = groupHistory([recheck, lone, origin, offCase], links)
    expect(entries.map((entry) => (entry.kind === 'case' ? `case:${entry.checks.map((c) => c.id).join(',')}` : `check:${entry.check.id}`))).toEqual([
      `case:${RECHECK},${ORIGIN}`,
      `check:${lone.id}`,
      `check:${offCase.id}`,
    ])
    expect(entryChecks(entries)).toBe(4)
  })

  it('leaves the history as it was without cases', () => {
    const checks = [check(ORIGIN, '2026-10-23T06:00:00.000Z'), check(RECHECK, '2026-10-22T06:00:00.000Z')]
    expect(groupHistory(checks, new Map()).every((entry) => entry.kind === 'check')).toBe(true)
  })
})

describe('the timeline', () => {
  const item = fullCase({
    status: 'closed',
    outcome: 'improved',
    closed_at: '2026-10-25T06:00:00.000Z',
    next_slot: null,
    next_due_at: null,
    checks: [
      { check_id: RECHECK, kind: 'recheck', urgency: 'home_care', symptoms: 'Стала активнее', created_at: '2026-10-24T09:20:00.000Z' },
      { check_id: ORIGIN, kind: 'origin', urgency: 'monitor', symptoms: 'Ест меньше', created_at: '2026-10-23T06:00:00.000Z' },
    ],
    checkins: [
      { id: '55555555-5555-4555-8555-000000000002', slot: 'mid', vet_visited: null, state: 'better', note: null, decision: 'close_improved', created_at: '2026-10-25T06:00:00.000Z' },
      { id: '55555555-5555-4555-8555-000000000001', slot: 'mid', vet_visited: null, state: 'same', note: 'Поела немного', decision: 'keep_watching', created_at: '2026-10-24T06:00:00.000Z' },
    ],
    visits: [{ event_id: '66666666-6666-4666-8666-000000000001', check_id: RECHECK, status: 'done', date: '2026-10-24', clinic: 'Вет' }],
  })

  it('puts checks, answers, visits and the closing in time order, the closing last', () => {
    expect(caseTimeline(item).map((event) => event.kind)).toEqual(['check', 'checkin', 'check', 'visit', 'checkin', 'closed'])
  })

  it('spans from the first check to the closing', () => {
    expect(caseSpan(item)).toEqual({ from: '2026-10-23T06:00:00.000Z', to: '2026-10-25T06:00:00.000Z' })
  })

  it('has no closing while the case is open', () => {
    expect(caseTimeline(fullCase()).map((event) => event.kind)).toEqual(['check'])
  })
})

describe('the re-check plaque', () => {
  it('names the latest check of the case and the answers given since it', () => {
    const item = fullCase({
      checks: [
        { check_id: ORIGIN, kind: 'origin', urgency: 'monitor', symptoms: '', created_at: '2026-10-23T06:00:00.000Z' },
      ],
      checkins: [
        { id: '55555555-5555-4555-8555-000000000001', slot: 'mid', vet_visited: null, state: 'same', note: null, decision: 'keep_watching', created_at: '2026-10-23T18:00:00.000Z' },
        { id: '55555555-5555-4555-8555-000000000002', slot: 'final', vet_visited: null, state: 'worse', note: null, decision: 'see_vet_today', created_at: '2026-10-25T06:00:00.000Z' },
      ],
    })
    expect(recheckPlaque(words, item, 'ru', UTC)).toBe('Учтём проверку от 23 октября и 2 отметки')
    expect(recheckPlaque(words, fullCase(), 'ru', UTC)).toBe('Учтём проверку от 23 октября')
  })
})

describe('the health record', () => {
  it('lists episodes closed within six months for the vet', () => {
    const episode = (closed: string): PastEpisode => ({
      case_id: CASE,
      origin_urgency: 'monitor',
      symptoms: 'Ест меньше',
      started_at: closed,
      closed_at: closed,
      outcome: 'improved',
    })
    const now = new Date('2026-10-25T12:00:00.000Z')
    const kept = recentEpisodes([episode('2026-10-01T00:00:00.000Z'), episode('2026-03-01T00:00:00.000Z'), episode('2026-05-01T00:00:00.000Z')], now)
    expect(kept.map((item) => item.closed_at)).toEqual(['2026-10-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'])
  })

  it('writes the pet’s line with its species first', () => {
    expect(petLineOf('cat', 'Сибирская · 6 лет', ru)).toBe('Кошка · Сибирская · 6 лет')
    expect(petLineOf('dog', '', ru)).toBe('Собака')
  })
})
