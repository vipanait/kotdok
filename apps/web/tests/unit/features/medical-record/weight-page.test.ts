import { describe, expect, it } from 'vitest'
import type { HealthOverview, WeightMeasurement } from '@lapka/contracts'
import { ApiError, ApiTimeoutError } from '@lapka/shared'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { fieldErrors, saveFailure, saveFailureText } from '@/features/medical-record/weight/weight-form'
import { parseWeightSaved, weightPage } from '@/features/medical-record/weight/weight-view'
import { DESIGN_TODAY, bobik, murka } from './demo-overviews'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function withWeights(overview: HealthOverview, weights: WeightMeasurement[], current: number | null): HealthOverview {
  return { ...overview, pet: { ...overview.pet, weight_kg: current }, weights }
}

describe('the weight page: periods really filter the chart (MW-02)', () => {
  it('draws the half year’s points with the half year’s trend', () => {
    // 24 September: the half year starts 24 March, so 12 March is outside it.
    const view = weightPage(ru, 'ru', murka, 'halfYear', DESIGN_TODAY, true)
    expect(view.summary).toMatchObject({ kind: 'chart', current: '4,2 кг', trend: '−0,2 кг за 2 месяца' })
    expect(view.summary.kind === 'chart' && view.summary.points.map((point) => point.day)).toEqual(['2026-06-20', '2026-09-12'])
    expect(view.summary.kind === 'chart' && view.summary.label).toBe('График веса за полгода: от 4,4 до 4,2 кг')
  })

  it('draws the year’s three points with the year’s trend', () => {
    const view = weightPage(ru, 'ru', murka, 'year', DESIGN_TODAY, true)
    expect(view.summary).toMatchObject({ kind: 'chart', trend: '−0,3 кг за 6 месяцев' })
    expect(view.summary.kind === 'chart' && view.summary.points).toHaveLength(3)
  })

  it('says a period without measurements in words, with the latest one', () => {
    const old = withWeights(murka, [{ id: id(1), measured_on: '2025-01-10', weight_kg: 4, source: 'record' }, { id: id(2), measured_on: '2024-12-01', weight_kg: 3.9, source: 'record' }], 4)
    expect(weightPage(ru, 'ru', old, 'year', DESIGN_TODAY, true).summary).toEqual({
      kind: 'text',
      current: '4 кг',
      text: 'Измерений за год нет. Последнее — 10 января 2025.',
    })
    // The same history over all time is a chart.
    expect(weightPage(ru, 'ru', old, 'all', DESIGN_TODAY, true).summary.kind).toBe('chart')
  })

  it('says one point in the period in words, and one point in all as the design does', () => {
    const one = weightPage(ru, 'ru', murka, 'halfYear', '2027-02-01', true)
    expect(one.summary).toEqual({
      kind: 'text',
      current: '4,2 кг',
      text: 'Одно измерение за полгода — 12 сентября 2026. Добавьте ещё одно или выберите период длиннее, чтобы увидеть изменения.',
    })
    const single = withWeights(murka, [{ id: id(1), measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' }], 4.2)
    expect(weightPage(ru, 'ru', single, 'all', DESIGN_TODAY, true).summary).toEqual({
      kind: 'text',
      current: '4,2 кг',
      text: 'Добавьте ещё одно измерение, чтобы увидеть изменения.',
    })
  })

  it('says there is no weight at all rather than drawing an empty chart', () => {
    const none = withWeights(bobik, [], null)
    const view = weightPage(ru, 'ru', none, 'halfYear', DESIGN_TODAY, true)
    expect(view.summary).toEqual({ kind: 'none', title: 'Измерений пока нет', body: expect.any(String) })
    expect(view.rows).toEqual([])
  })
})

describe('the weight page: every date and value readable without the chart', () => {
  it('lists every measurement, newest first, each with its own form', () => {
    const view = weightPage(ru, 'ru', murka, 'halfYear', DESIGN_TODAY, true)
    expect(view.subtitle).toBe('Мурка · Измерения и изменения')
    expect(view.rows.map((row) => [row.day, row.value, row.action?.label, row.action?.href])).toEqual([
      ['12 сентября 2026', '4,2 кг', 'Изменить', `/pets/${murka.pet.id}/health/${murka.weights[0].id}/edit`],
      ['20 июня 2026', '4,4 кг', 'Изменить', `/pets/${murka.pet.id}/health/${murka.weights[1].id}/edit`],
      ['12 марта 2026', '4,5 кг', 'Изменить', `/pets/${murka.pet.id}/health/${murka.weights[2].id}/edit`],
    ])
    // A screen reader hears which measurement a link changes.
    expect(view.rows[0].action?.ariaLabel).toBe('Изменить измерение: 4,2 кг, 12 сентября 2026')
  })

  it('shows the form’s weight of an older pet with no history, «Уточнить» adding a dated one (web v1 «weight-one»)', () => {
    const view = weightPage(ru, 'ru', bobik, 'halfYear', DESIGN_TODAY, true)
    expect(view.subtitle).toBe('Бобик · Из анкеты')
    expect(view.summary).toEqual({ kind: 'text', current: '28 кг', text: 'Добавьте ещё одно измерение, чтобы увидеть изменения.' })
    expect(view.rows).toEqual([
      {
        key: 'form',
        day: 'Дата не указана',
        note: 'из анкеты',
        value: '28 кг',
        action: { href: `/pets/${bobik.pet.id}/health/new?type=weight`, label: 'Уточнить', ariaLabel: 'Уточнить вес 28 кг: дата не указана' },
      },
    ])
  })

  it('opens the form’s undated row by its own id, and marks values from the form', () => {
    const history = withWeights(
      bobik,
      [
        { id: id(10), measured_on: '2026-09-20', weight_kg: 27.5, source: 'form' },
        { id: id(11), measured_on: null, weight_kg: 28, source: 'form' },
      ],
      27.5,
    )
    const rows = weightPage(ru, 'ru', history, 'halfYear', DESIGN_TODAY, true).rows
    expect(rows.map((row) => [row.day, row.note, row.action?.label, row.action?.href])).toEqual([
      ['20 сентября 2026', 'из анкеты', 'Изменить', `/pets/${bobik.pet.id}/health/${id(10)}/edit`],
      ['Дата не указана', 'из анкеты', 'Уточнить', `/pets/${bobik.pet.id}/health/${id(11)}/edit`],
    ])
  })

  it('offers no links where weights cannot be changed', () => {
    expect(weightPage(ru, 'ru', murka, 'halfYear', DESIGN_TODAY, false).rows.every((row) => row.action === null)).toBe(true)
  })

  it('speaks English too', () => {
    const view = weightPage(en, 'en', murka, 'year', DESIGN_TODAY, true)
    expect(view.summary).toMatchObject({ kind: 'chart', current: '4.2 kg', trend: '−0.3 kg over 6 months' })
  })

  it('reads ?saved= strictly', () => {
    expect(parseWeightSaved('added')).toBe('added')
    expect(parseWeightSaved('deleted')).toBe('deleted')
    expect(parseWeightSaved('nope')).toBeNull()
    expect(parseWeightSaved(['added'])).toBeNull()
  })
})

describe('the weight form’s messages', () => {
  it('names the contract’s bounds in the owner’s notation', () => {
    expect(fieldErrors(ru, { weight: 'invalid', day: 'future' })).toEqual({
      weight: 'Вес — число от 0,1 до 200, один знак после запятой',
      day: 'Дата не может быть позже сегодняшней',
    })
    expect(fieldErrors(en, { weight: 'invalid' }).weight).toBe('Weight is a number from 0.1 to 200, one decimal place')
    expect(fieldErrors(ru, { weight: 'empty', day: 'empty' })).toEqual({ weight: 'Укажите вес', day: 'Укажите дату' })
    expect(fieldErrors(ru, {})).toEqual({ weight: undefined, day: undefined })
  })

  it('sorts a failed request into what the owner can do', () => {
    expect(saveFailure(new ApiError('conflict', 409, 'taken'))).toBe('dayTaken')
    expect(saveFailure(new ApiError('bad_request', 400, 'no'))).toBe('rejected')
    expect(saveFailure(new ApiError('not_found', 404, 'gone'))).toBe('gone')
    expect(saveFailure(new ApiError('unauthorized', 401, 'no'))).toBe('signedOut')
    expect(saveFailure(new ApiError('account_deleting', 403, 'no'))).toBe('deleting')
    expect(saveFailure(new ApiError('internal_error', 500, 'no'))).toBe('failed')
    expect(saveFailure(new TypeError('Failed to fetch'))).toBe('offline')
    expect(saveFailure(new ApiTimeoutError('/pets/x/health/weights', 15000))).toBe('offline')
    expect(saveFailure(new Error('?'))).toBe('failed')
    expect(saveFailureText(ru, 'offline')).toBe('Нет связи с сервером. Введённое не потеряно — попробуйте ещё раз.')
  })
})
