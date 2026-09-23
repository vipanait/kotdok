import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { checkAnswers, formatCheckedAt, photoObservations } from './check-answers'

describe('reading back what was answered on the second step', () => {
  it('names every answer in the order the form asks', () => {
    expect(
      checkAnswers(ru, {
        appetite: 'reduced',
        activity: 'low',
        duration: '4-7days',
        stool: 'loose',
        pain_signs: ['hiding', 'grimace'],
        raw: { anything: true },
      }),
    ).toEqual([
      { label: ru.check.appetite, value: 'Ест меньше' },
      { label: ru.check.activity, value: 'Менее активный' },
      { label: ru.check.duration, value: '4–7 дней' },
      { label: ru.check.stool, value: 'Жидкий (понос)' },
      { label: ru.check.painSigns, value: 'Прячется больше обычного, Прищур / гримаса' },
    ])
  })

  it('leaves out what was not answered', () => {
    expect(checkAnswers(en, { appetite: null, duration: 'today', pain_signs: [] })).toEqual([
      { label: en.check.duration, value: 'Today' },
    ])
    expect(checkAnswers(en, null)).toEqual([])
  })

  it('drops a value it has no word for instead of showing it raw', () => {
    // `full_response` is not held to the contract, and has changed shape before.
    expect(
      checkAnswers(ru, { appetite: 'ravenous', activity: 42, pain_signs: ['limping', 'hiding'] }),
    ).toEqual([{ label: ru.check.painSigns, value: 'Прячется больше обычного' }])
  })
})

describe('when a check was made', () => {
  it('keeps the time, so two checks on one day can be told apart', () => {
    const morning = formatCheckedAt('2026-09-17T06:05:00Z', 'ru')
    const evening = formatCheckedAt('2026-09-17T16:40:00Z', 'ru')
    expect(morning).toMatch(/сентября 2026/)
    expect(morning).not.toBe(evening)
  })
})

describe('what the analysis saw in the photos', () => {
  it('reads it back when photos were sent', () => {
    expect(photoObservations({ photo_count: 2, photo_observations: 'Покраснение у глаза' })).toBe(
      'Покраснение у глаза',
    )
  })

  it('says nothing about photos a check never had', () => {
    // The model may still fill the field in; with no photo it can only be a guess.
    expect(photoObservations({ photo_count: 0, photo_observations: 'Кошка выглядит здоровой' })).toBeNull()
    expect(photoObservations({ photo_observations: 'что-то' })).toBeNull()
    expect(photoObservations(null)).toBeNull()
  })

  it('shows nothing rather than an empty heading', () => {
    expect(photoObservations({ photo_count: 1, photo_observations: '  ' })).toBeNull()
    expect(photoObservations({ photo_count: 1, photo_observations: null })).toBeNull()
  })
})
