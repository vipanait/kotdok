import { describe, expect, it } from 'vitest'
import { normalizeAnswer, OFF_TOPIC_ANSWER } from '@/server/check-questions/question-answer'

const raw = (value: Record<string, unknown>) => JSON.stringify(value)

describe('what is kept of the model answer', () => {
  it('keeps a plain answer as it is', () => {
    expect(normalizeAnswer(raw({ answer: ' Дайте воды. ', alert: 'none', off_topic: false }), 'monitor', 'ru')).toEqual({
      answer: 'Дайте воды.',
      alert: 'none',
      offTopic: false,
    })
  })

  it.each([
    ['clinic_now', 'urgent', 'clinic_now'],
    ['clinic_now', 'emergency', 'none'],
    ['see_vet_today', 'emergency', 'none'],
    ['see_vet_today', 'urgent', 'none'],
    ['see_vet_today', 'monitor', 'see_vet_today'],
    ['see_vet_today', 'home_care', 'see_vet_today'],
    ['clinic_now', 'healthy', 'clinic_now'],
  ] as const)('alert %s on a check that is %s becomes %s', (alert, urgency, kept) => {
    expect(normalizeAnswer(raw({ answer: 'Текст.', alert, off_topic: false }), urgency, 'ru').alert).toBe(kept)
  })

  it('drops the numbers of the knowledge base the context is marked with', () => {
    // The context is numbered for the analysis's sources (SRC-01); an answer shows none.
    expect(normalizeAnswer(raw({ answer: 'Дайте воды [1]. Покой [2, 3].' }), 'monitor', 'ru').answer).toBe('Дайте воды. Покой.')
  })

  it('reads an alert it does not know, or none at all, as none', () => {
    expect(normalizeAnswer(raw({ answer: 'Текст.', alert: 'panic' }), 'monitor', 'ru').alert).toBe('none')
    expect(normalizeAnswer(raw({ answer: 'Текст.' }), 'monitor', 'ru')).toMatchObject({ alert: 'none', offTopic: false })
  })

  it('answers an off-topic question with the fixed sentence and no alert', () => {
    expect(normalizeAnswer(raw({ answer: 'Завтра дождь.', alert: 'clinic_now', off_topic: true }), 'monitor', 'ru')).toEqual({
      answer: OFF_TOPIC_ANSWER.ru,
      alert: 'none',
      offTopic: true,
    })
    expect(normalizeAnswer(raw({ answer: '', off_topic: true }), 'monitor', 'en').answer).toBe(OFF_TOPIC_ANSWER.en)
  })

  it('cuts a long answer at the end of a sentence within 1500 characters', () => {
    const long = Array.from({ length: 100 }, (_, i) => `Предложение номер ${i} про кота.`).join(' ')
    const { answer } = normalizeAnswer(raw({ answer: long }), 'monitor', 'ru')
    expect(Array.from(answer).length).toBeLessThanOrEqual(1500)
    expect(answer.endsWith('про кота.')).toBe(true)
  })

  it('ends a long answer without a single full stop with an ellipsis', () => {
    const { answer } = normalizeAnswer(raw({ answer: 'а'.repeat(2000) }), 'monitor', 'ru')
    expect(Array.from(answer).length).toBe(1500)
    expect(answer.endsWith('…')).toBe(true)
  })

  it('refuses what is not an answer', () => {
    expect(() => normalizeAnswer('not json', 'monitor', 'ru')).toThrow()
    expect(() => normalizeAnswer(raw({ answer: '  ' }), 'monitor', 'ru')).toThrow()
    expect(() => normalizeAnswer(raw({ alert: 'none' }), 'monitor', 'ru')).toThrow()
    expect(() => normalizeAnswer('[]', 'monitor', 'ru')).toThrow()
  })
})
