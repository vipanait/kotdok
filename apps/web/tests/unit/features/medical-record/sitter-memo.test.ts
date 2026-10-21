import { describe, expect, it } from 'vitest'
import type { HealthEvent, HealthOverview, Medication, Pet } from '@lapka/contracts'
import ru from '@/shared/i18n/dictionaries/ru'
import { memoText, sitterMemo } from '@/features/medical-record/summary/sitter-memo'

const TODAY = '2026-10-20'

const pet: Pet = {
  id: '11111111-1111-4111-8111-111111111111',
  species: 'cat',
  name: 'Мурка',
  breed: 'Сибирская',
  age_years: 6,
  weight_kg: 4.2,
  sex: 'female',
  neutered: true,
  indoor_outdoor: 'indoor',
  diet: 'dry',
  size_class: null,
  walk_activity: null,
  allergies: ['курица', 'рыба, кроме лосося'],
  vaccinated: true,
  chronic_conditions: ['ХБП'],
  medications: ['Нефростоп'],
  notes: 'Боится пылесоса',
  birth_date: null,
  birth_date_approx: false,
  adopted_on: null,
  avatar_url: null,
  created_at: '2026-09-01T00:00:00.000Z',
}

const event = (overrides: Partial<HealthEvent>): HealthEvent =>
  ({
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'vaccination',
    status: 'planned',
    date: TODAY,
    clinic: null,
    notes: null,
    items: [],
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
    ...overrides,
  }) as HealthEvent

const item = (id: string, name: string | null, targets: string[] = []) => ({
  id,
  name,
  targets,
  source_item_id: null,
  product_id: null,
  interval: null,
  instructions: null,
  medication_id: null,
})

const course = (overrides: Partial<Medication>): Medication => ({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Нефростоп',
  dosage: '1 таблетка',
  started_on: '2026-10-15',
  ended_on: null,
  ongoing: true,
  source: 'record',
  reminder_times: ['08:00', '20:00'],
  ...overrides,
})

const overview = (overrides: Partial<HealthOverview> = {}): HealthOverview => ({
  pet,
  writable: [],
  weights: [],
  events: [
    event({ id: 'e1', kind: 'visit', status: 'done', date: '2026-09-01', clinic: 'Вега', visit_kind: 'checkup' }),
    event({ id: 'e2', kind: 'visit', date: '2026-10-21', clinic: 'Вега', visit_kind: 'checkup' }),
    event({ id: 'e3', date: '2026-10-10', items: [item('i3', 'Нобивак Tricat')] }),
    event({ id: 'e4', kind: 'parasite', date: '2026-11-03', items: [item('i4', null, ['fleas', 'ticks'])] }),
  ],
  medications: [course({})],
  ...overrides,
})

const section = (memo: ReturnType<typeof sitterMemo>, key: string) => memo.sections.find((entry) => entry.key === key)

describe('«Памятка для передержки» (FB-3/02, design `memo`)', () => {
  it('heads with the pet: name, species, breed, age', () => {
    const memo = sitterMemo(ru, 'ru', overview(), TODAY)
    expect(memo.name).toBe('Мурка')
    expect(memo.meta).toBe('Кошка · Сибирская · 6 лет')
  })

  it('says the food, the allergies one by one, and the illnesses', () => {
    const memo = sitterMemo(ru, 'ru', overview(), TODAY)
    expect(section(memo, 'diet')?.lines).toEqual(['Сухой корм'])
    // «; » between allergies: one of them has a comma of its own.
    expect(section(memo, 'particulars')?.lines).toEqual(['Аллергии: курица; рыба, кроме лосося', 'Хронические болезни: ХБП'])
  })

  it('lists the medicines given today with the dosage and the times the owner set', () => {
    expect(section(sitterMemo(ru, 'ru', overview(), TODAY), 'medicines')?.lines).toEqual(['Нефростоп — 1 таблетка', 'Время приёма: 08:00, 20:00'])
  })

  it('keeps a course on its last day, drops one that ended or has not started', () => {
    const memo = sitterMemo(
      ru,
      'ru',
      overview({
        medications: [
          course({ id: 'last', name: 'Синулокс', ended_on: TODAY, ongoing: false, reminder_times: [] }),
          course({ id: 'past', name: 'Мелоксикам', ended_on: '2026-10-19', ongoing: false }),
          course({ id: 'later', name: 'Мильбемакс', started_on: '2026-10-21' }),
        ],
      }),
      TODAY,
    )
    expect(section(memo, 'medicines')?.lines).toEqual(['Синулокс — 1 таблетка'])
  })

  it('takes the form’s list when the record has no courses at all', () => {
    expect(section(sitterMemo(ru, 'ru', overview({ medications: [] }), TODAY), 'medicines')?.lines).toEqual(['Нефростоп'])
  })

  it('lists what is due in the next 14 days, overdue first; the 14th day in, the 15th out', () => {
    const memo = sitterMemo(
      ru,
      'ru',
      overview({
        events: [
          event({ id: 'a', date: '2026-10-10', items: [item('i1', 'Нобивак Tricat')] }),
          event({ id: 'b', kind: 'visit', date: '2026-10-21', clinic: 'Вега', visit_kind: 'checkup' }),
          event({ id: 'c', kind: 'parasite', date: '2026-11-03', items: [item('i2', null, ['fleas', 'ticks'])] }),
          event({ id: 'd', kind: 'parasite', date: '2026-11-04', items: [item('i3', null, ['worms'])] }),
        ],
      }),
      TODAY,
    )
    expect(section(memo, 'plans')?.lines).toEqual([
      'Прививка «Нобивак Tricat»: дата 10 октября прошла',
      '21 октября — Визит к врачу: осмотр, Вега',
      '3 ноября — Обработка от блох и клещей',
    ])
  })

  it('leaves out a date overdue for months: the owner’s to sort out, not the sitter’s', () => {
    const memo = sitterMemo(ru, 'ru', overview({ events: [event({ id: 'old', date: '2026-06-01', items: [item('i1', 'Нобивак')] })] }), TODAY)
    expect(section(memo, 'plans')).toBeUndefined()
  })

  it('names the clinic of the last visit that happened', () => {
    expect(section(sitterMemo(ru, 'ru', overview(), TODAY), 'clinic')?.lines).toEqual(['Вега'])
  })

  it('skips every section it has nothing for', () => {
    const bare: Pet = { ...pet, breed: null, age_years: null, sex: null, diet: null, allergies: [], chronic_conditions: [], medications: [], notes: null }
    const memo = sitterMemo(ru, 'ru', overview({ pet: bare, events: [], medications: [] }), TODAY)
    expect(memo.sections).toEqual([])
    expect(memo.meta).toBe('Кошка')
  })

  it('never carries a symptom check or the visit’s reasons and diagnoses', () => {
    const fromCheck = event({ id: 'v', kind: 'visit', date: '2026-10-22', reason: 'Рвота два дня', diagnosis: 'Гастрит', check_id: '44444444-4444-4444-8444-444444444444' })
    const text = memoText(ru, sitterMemo(ru, 'ru', overview({ events: [fromCheck] }), TODAY))
    expect(text).not.toContain('Рвота')
    expect(text).not.toContain('Гастрит')
    expect(text).not.toMatch(/проверк/i)
  })

  it('is plain text to paste anywhere: name, sections with their titles', () => {
    const text = memoText(ru, sitterMemo(ru, 'ru', overview(), TODAY))
    expect(text.startsWith('Мурка — Кошка · Сибирская · 6 лет\n\nПитание\nСухой корм')).toBe(true)
    expect(text).toContain('Лекарства сейчас\nНефростоп — 1 таблетка\nВремя приёма: 08:00, 20:00')
    expect(text.endsWith('Памятка из «Лапки». Проверьте, что сведения актуальны.')).toBe(true)
  })
})
