import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CheckQuestionThread } from '@lapka/contracts'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { alertText, clearedAfterAnswer, conflictNotice, isOpen, showsBlock, suggestionsFor, threadNote } from './check-questions'

// CQ-03: what the questions block under a result says, on the app's own words.

const NOW = new Date('2026-11-13T12:00:00.000Z')

function thread(over: Partial<CheckQuestionThread> = {}): CheckQuestionThread {
  return { items: [], limit: 3, remaining: 3, open_until: '2026-11-15T11:20:00.000Z', closed: null, ...over }
}

const asked = {
  id: '11111111-1111-4111-8111-000000000001',
  question: 'Можно ли кормить?',
  answer: 'Понемногу.',
  alert: 'none' as const,
  off_topic: false,
  created_at: '2026-11-13T10:00:00.000Z',
}

describe('the three suggested questions', () => {
  it.each([
    ['emergency', ['Что делать по дороге в клинику?', 'Что взять с собой?', 'Что сказать врачу в первую очередь?']],
    ['urgent', ['Что делать до визита?', 'Можно ли кормить и поить?', 'Что должно насторожить до визита?']],
    ['monitor', ['На что смотреть в ближайшие сутки?', 'Можно ли кормить как обычно?', 'Когда точно пора к врачу?']],
    ['home_care', ['На что смотреть в ближайшие сутки?', 'Можно ли кормить как обычно?', 'Когда точно пора к врачу?']],
    ['healthy', ['Когда это перестаёт быть нормой?', 'Нужно ли что-то менять в уходе?', 'Что стоит проверить на плановом осмотре?']],
  ] as const)('are the spec’s for %s', (urgency, expected) => {
    expect(suggestionsFor(urgency, ru.checkQuestions)).toEqual(expected)
  })

  it('are written in English for every level', () => {
    for (const urgency of ['emergency', 'urgent', 'monitor', 'home_care', 'healthy'] as const) {
      const english = suggestionsFor(urgency, en.checkQuestions)
      expect(english).toHaveLength(3)
      expect(english.join(' ')).not.toMatch(/[а-яё]/i)
    }
  })
})

describe('the line under the title', () => {
  it('counts what is left with Russian plurals and says until when', () => {
    expect(threadNote(thread({ remaining: 3 }), NOW, ru.checkQuestions, 'ru', 'Europe/Moscow')).toBe(
      'Осталось 3 вопроса из 3 · до 15 ноября, 14:20',
    )
    expect(threadNote(thread({ remaining: 1 }), NOW, ru.checkQuestions, 'ru', 'Europe/Moscow')).toMatch(/^Остался 1 вопрос из 3 · /)
  })

  it('counts in English', () => {
    expect(threadNote(thread({ remaining: 1 }), NOW, en.checkQuestions, 'en', 'UTC')).toMatch(/^1 question of 3 left · until November 15, 11:20 AM$/)
    expect(threadNote(thread({ remaining: 2 }), NOW, en.checkQuestions, 'en', 'UTC')).toMatch(/^2 questions of 3 left · /)
  })

  it('says why no more are taken, on this clock too', () => {
    expect(threadNote(thread({ remaining: 0, closed: 'limit' }), NOW, ru.checkQuestions, 'ru')).toBe(
      'Вопросы по этой проверке закончились. Если что-то изменилось, сделайте новую проверку.',
    )
    expect(threadNote(thread({ closed: 'expired' }), NOW, ru.checkQuestions, 'ru')).toBe('Вопросы можно задать в течение 48 часов после проверки.')
    const later = new Date('2026-11-15T11:21:00.000Z')
    expect(isOpen(thread(), later)).toBe(false)
    expect(threadNote(thread(), later, ru.checkQuestions, 'ru')).toBe('Вопросы можно задать в течение 48 часов после проверки.')
  })
})

describe('whether the block is drawn at all', () => {
  it('is left out once the window passed with nothing asked', () => {
    expect(showsBlock(thread({ closed: 'expired' }), NOW)).toBe(false)
    expect(showsBlock(thread({ closed: 'expired', items: [asked] }), NOW)).toBe(true)
    expect(showsBlock(thread(), NOW)).toBe(true)
  })
})

describe('the plate under an alarming answer', () => {
  it('says the fixed words', () => {
    expect(alertText('see_vet_today', 'Мурка', ru.checkQuestions)).toBe('Это меняет картину. Покажите питомца врачу сегодня.')
    expect(alertText('clinic_now', 'Мурка', ru.checkQuestions)).toBe('Это может быть опасно. Езжайте в клинику сейчас.')
    expect(alertText('see_vet_today', 'Rex', en.checkQuestions)).toBe('This changes the picture. Have Rex seen by a vet today.')
    expect(alertText('see_vet_today', null, en.checkQuestions)).toBe('This changes the picture. Have your pet seen by a vet today.')
    expect(alertText('none', 'Rex', en.checkQuestions)).toBeNull()
  })
})

describe('what a refused question says (409)', () => {
  it('says the answer is still on its way while the thread is open', () => {
    expect(conflictNotice(thread(), NOW, ru.checkQuestions)).toBe('Ответ на этот вопрос ещё готовится. Загляните сюда через минуту.')
  })

  it('says nothing more when the thread closed, and fails when it could not be read', () => {
    expect(conflictNotice(thread({ remaining: 0, closed: 'limit' }), NOW, ru.checkQuestions)).toBeNull()
    expect(conflictNotice(null, NOW, ru.checkQuestions)).toBe(ru.checkQuestions.failed)
  })
})

describe('the field after an answer', () => {
  it('is emptied only if it still holds the question that was answered', () => {
    expect(clearedAfterAnswer('Можно ли кормить?', 'Можно ли кормить?')).toBe('')
    expect(clearedAfterAnswer('  Можно ли кормить? ', 'Можно ли кормить?')).toBe('')
    // Typed while waiting: the next question stays.
    expect(clearedAfterAnswer('А поить?', 'Можно ли кормить?')).toBe('А поить?')
  })
})

describe('the deadline on a phone whose Intl gives no hour or minute parts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('still writes the time, on the phone\'s own clock', () => {
    // Hermes on the iOS 26 simulator: formatToParts returns the day and the month, and no hour or minute.
    const real = Intl.DateTimeFormat.prototype.formatToParts
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(function (this: Intl.DateTimeFormat, date) {
      return real.call(this, date).filter((part) => part.type !== 'hour' && part.type !== 'minute')
    })
    const until = new Date(thread().open_until)
    const hh = String(until.getHours()).padStart(2, '0')
    const mm = String(until.getMinutes()).padStart(2, '0')
    expect(threadNote(thread(), NOW, ru.checkQuestions, 'ru')).toBe(`Осталось 3 вопроса из 3 · до ${until.getDate()} ноября, ${hh}:${mm}`)
    expect(threadNote(thread(), NOW, en.checkQuestions, 'en')).toMatch(/ · until November \d+, \d{1,2}:\d{2} (AM|PM)$/)
  })
})

