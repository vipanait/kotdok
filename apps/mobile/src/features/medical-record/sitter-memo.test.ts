import { describe, expect, it } from 'vitest'
import type { HealthEvent, HealthOverview, Medication, Pet } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { sitterMemo } from './sitter-memo'

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
  birth_date: '2020-10-20',
  birth_date_approx: false,
  adopted_on: null,
  created_at: '2026-09-01T00:00:00.000Z',
}

const event = (overrides: Partial<HealthEvent>): HealthEvent => ({
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
})

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
  dosage: '1 таблетка утром',
  started_on: null,
  ended_on: null,
  ongoing: true,
  source: 'record',
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
    event({ id: 'e5', kind: 'parasite', date: '2026-11-04', items: [item('i5', null, ['worms'])] }),
  ] as HealthEvent[],
  medications: [
    course({}),
    course({ id: 'past', name: 'Синулокс', ended_on: '2026-10-01', ongoing: false }),
    course({ id: 'later', name: 'Мильбемакс', started_on: '2026-11-01' }),
  ],
  ...overrides,
})

describe('the memo for whoever minds the pet (FB-3/02)', () => {
  it('says the essentials and the next two weeks, overdue first', () => {
    expect(sitterMemo(ru, overview(), TODAY)).toBe(
      [
        'Мурка — кошка, Сибирская, 6 лет',
        'Питание: Сухой корм',
        'Аллергии: курица; рыба, кроме лосося',
        'Хронические болезни: ХБП',
        'Лекарства сейчас:\n— Нефростоп, 1 таблетка утром',
        'Заметки: Боится пылесоса',
        'Ветклиника: Вега',
        'Ближайшие 2 недели:\n— просрочено с 10 октября: прививка «Нобивак Tricat»\n— 21 октября: визит к врачу, Вега\n— 3 ноября: обработка от блох и клещей',
        'Отправлено из «Лапки»',
      ].join('\n\n'),
    )
  })

  it('leaves out every section it has nothing for', () => {
    const bare: Pet = {
      ...pet,
      breed: null,
      age_years: null,
      birth_date: null,
      sex: null,
      diet: null,
      allergies: [],
      chronic_conditions: [],
      medications: [],
      notes: null,
    }
    expect(sitterMemo(ru, overview({ pet: bare, events: [], medications: [] }), TODAY)).toBe(
      'Мурка — кот\n\nОтправлено из «Лапки»',
    )
  })
})
