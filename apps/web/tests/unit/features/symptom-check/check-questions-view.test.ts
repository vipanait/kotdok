import { describe, expect, it } from 'vitest'
import type { CheckQuestionThread } from '@lapka/contracts'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { alertText, isOpen, showsBlock, suggestionsFor, threadNote } from '@/features/symptom-check/check-questions-view'

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
    [
      'healthy',
      ['Когда это перестаёт быть нормой?', 'Нужно ли что-то менять в уходе?', 'Что стоит проверить на плановом осмотре?'],
    ],
  ] as const)('are the spec’s for %s', (urgency, expected) => {
    expect(suggestionsFor(urgency, ru.checkQuestions)).toEqual(expected)
  })

  it('exist in English for every level', () => {
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
    expect(threadNote(thread({ remaining: 2 }), NOW, ru.checkQuestions, 'ru', 'Europe/Moscow')).toMatch(/^Осталось 2 вопроса из 3 · /)
    expect(threadNote(thread({ remaining: 1 }), NOW, ru.checkQuestions, 'ru', 'Europe/Moscow')).toMatch(/^Остался 1 вопрос из 3 · /)
  })

  it('counts in English', () => {
    expect(threadNote(thread({ remaining: 1 }), NOW, en.checkQuestions, 'en', 'UTC')).toMatch(/^1 question of 3 left · until November 15/)
    expect(threadNote(thread({ remaining: 2 }), NOW, en.checkQuestions, 'en', 'UTC')).toMatch(/^2 questions of 3 left · /)
  })

  it('says why the thread is closed', () => {
    expect(threadNote(thread({ remaining: 0, closed: 'limit' }), NOW, ru.checkQuestions, 'ru')).toBe(
      'Вопросы по этой проверке закончились. Если что-то изменилось, сделайте новую проверку.',
    )
    expect(threadNote(thread({ closed: 'expired' }), NOW, ru.checkQuestions, 'ru')).toBe(
      'Вопросы можно задать в течение 48 часов после проверки.',
    )
  })

  it('closes on the browser’s clock when the page outlived the window', () => {
    const later = new Date('2026-11-15T11:21:00.000Z')
    expect(isOpen(thread(), later)).toBe(false)
    expect(threadNote(thread(), later, ru.checkQuestions, 'ru')).toBe('Вопросы можно задать в течение 48 часов после проверки.')
    expect(isOpen(thread(), NOW)).toBe(true)
    expect(isOpen(thread({ remaining: 0, closed: 'limit' }), NOW)).toBe(false)
  })
})

describe('whether the block is drawn at all', () => {
  it('is hidden once the window has passed with nothing asked, and shown with a thread to read', () => {
    expect(showsBlock(thread({ closed: 'expired' }), NOW)).toBe(false)
    expect(showsBlock(thread(), new Date('2026-11-16T00:00:00.000Z'))).toBe(false)
    expect(showsBlock(thread({ closed: 'expired', items: [asked] }), NOW)).toBe(true)
    expect(showsBlock(thread(), NOW)).toBe(true)
  })
})

describe('the plate under an alarming answer', () => {
  it('says the fixed words, never the model’s', () => {
    expect(alertText('see_vet_today', 'Мурка', ru.checkQuestions)).toBe('Это меняет картину. Покажите питомца врачу сегодня.')
    expect(alertText('clinic_now', 'Мурка', ru.checkQuestions)).toBe('Это может быть опасно. Езжайте в клинику сейчас.')
    expect(alertText('see_vet_today', 'Rex', en.checkQuestions)).toBe('This changes the picture. Have Rex seen by a vet today.')
    expect(alertText('see_vet_today', null, en.checkQuestions)).toBe('This changes the picture. Have your pet seen by a vet today.')
    expect(alertText('none', 'Rex', en.checkQuestions)).toBeNull()
  })
})

describe('where «Проверить снова» leads', () => {
  it('re-checks the open case with the previous check in mind, or starts a new check of the pet', async () => {
    const { recheckHref } = await import('@/features/symptom-check/check-questions-view')
    const pet = '22222222-2222-4222-8222-000000000001'
    const caseId = '33333333-3333-4333-8333-000000000001'
    expect(recheckHref(pet, { status: 'active', id: caseId })).toBe(`/check?pet=${pet}&case=${caseId}`)
    expect(recheckHref(pet, { status: 'closed', id: caseId })).toBe(`/check?pet=${pet}`)
    expect(recheckHref(pet, null)).toBe(`/check?pet=${pet}`)
    expect(recheckHref(null, null)).toBe('/check')
  })
})
