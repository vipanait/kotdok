import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { checkAnswers, formatCheckedAt, offersVisit, photoObservations, visitFormHref, visitReason, clinicSearchUrl, offersClinicSearch } from './check-answers'

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

describe('a visit from a result (MR-07.5)', () => {
  it('is offered on the four levels that need a vet, not on «healthy»', () => {
    for (const urgency of ['emergency', 'urgent', 'monitor', 'home_care']) {
      expect(offersVisit({ urgency, pet_id: 'p' }), urgency).toBe(true)
    }
    expect(offersVisit({ urgency: 'healthy', pet_id: 'p' })).toBe(false)
    expect(offersVisit({ urgency: 'urgent', pet_id: null })).toBe(false)
  })

  it('takes the first line of the description as the reason', () => {
    expect(visitReason('Рвота два дня\nне ест')).toBe('Рвота два дня')
  })

  it('skips blank lines before the description', () => {
    expect(visitReason('\n  \nРвота два дня\nне ест')).toBe('Рвота два дня')
  })
})

describe('opening the visit form from a result', () => {
  const check = { id: 'c1', pet_id: 'p1', symptoms_input: 'Рвота два дня\nне ест' }

  it('stays in the check and profile tabs, so back returns to the result', () => {
    expect(visitFormHref('check', check)).toBe(
      '/check/visit-form?id=p1&checkId=c1&reason=%D0%A0%D0%B2%D0%BE%D1%82%D0%B0%20%D0%B4%D0%B2%D0%B0%20%D0%B4%D0%BD%D1%8F',
    )
    expect(visitFormHref('profile', check)).toMatch(/^\/profile\/visit-form\?id=p1&checkId=c1&reason=/)
  })

  it("uses the pet's own route in the pets tab", () => {
    expect(visitFormHref('pets', check)).toMatch(/^\/pets\/p1\/visit-form\?checkId=c1&reason=/)
    expect(visitFormHref(undefined, check)).toMatch(/^\/pets\/p1\/visit-form\?/)
  })
})

describe('the nearest clinic', () => {
  it('is offered when the owner should be on the way to a vet, as on the site', () => {
    expect(offersClinicSearch('emergency')).toBe(true)
    expect(offersClinicSearch('urgent')).toBe(true)
    expect(offersClinicSearch('monitor')).toBe(false)
    expect(offersClinicSearch('home_care')).toBe(false)
  })

  it('is a Google Maps search around the person', () => {
    expect(clinicSearchUrl('ветеринарная клиника')).toBe(
      'https://www.google.com/maps/search/?api=1&query=%D0%B2%D0%B5%D1%82%D0%B5%D1%80%D0%B8%D0%BD%D0%B0%D1%80%D0%BD%D0%B0%D1%8F%20%D0%BA%D0%BB%D0%B8%D0%BD%D0%B8%D0%BA%D0%B0',
    )
  })
})
