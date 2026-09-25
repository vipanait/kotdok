import { describe, expect, it } from 'vitest'
import type { HealthEvent, HealthOverview, Pet, WeightMeasurement } from '@lapka/contracts'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { headerFacts, importantFacts, sectionRows } from './overview'

function pet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: '11111111-1111-4111-8111-000000000002',
    species: 'dog',
    name: 'Бобик',
    breed: null,
    age_years: 5,
    weight_kg: 28,
    sex: null,
    neutered: null,
    indoor_outdoor: null,
    diet: null,
    size_class: null,
    walk_activity: null,
    allergies: [],
    vaccinated: true,
    chronic_conditions: [],
    medications: [],
    notes: null,
    created_at: '2026-05-01T10:00:00.000Z',
    ...overrides,
  }
}

function overview(overrides: Partial<Pet> = {}, weights: WeightMeasurement[] = [], events: HealthEvent[] = []): HealthOverview {
  return { pet: pet(overrides), writable: ['vaccinations', 'weight'], weights, events }
}

const TODAY = '2026-09-24'

describe('medical record header', () => {
  it('shows Бобик as the form describes him: 28 kg, from the form', () => {
    // MR-01.3
    const facts = headerFacts(ru, overview(), TODAY)
    expect(facts.meta).toBe('Собака · 5 лет')
    expect(facts.weight).toBe('28 кг')
    expect(facts.weightNote).toBe('Из анкеты')
    expect(facts.neutered).toBeNull()
  })

  it('writes a fractional weight the way the language does', () => {
    expect(headerFacts(ru, overview({ weight_kg: 4.2 }), TODAY).weight).toBe('4,2 кг')
    expect(headerFacts(en, overview({ weight_kg: 4.2 }), TODAY).weight).toBe('4.2 kg')
  })

  it('leaves the weight out rather than showing zero when the form has none', () => {
    expect(headerFacts(ru, overview({ weight_kg: null }), TODAY).weight).toBeNull()
  })

  it('names the species even when the sex is known, in either language', () => {
    expect(headerFacts(ru, overview({ sex: 'female' }), TODAY).meta).toBe('Собака · 5 лет')
    expect(headerFacts(en, overview({ species: 'cat', sex: 'female', breed: null }), TODAY).meta).toBe('Cat · 5 years')
  })

  it('names the female cat and her neutering in the words the form uses', () => {
    const facts = headerFacts(ru, overview({ species: 'cat', sex: 'female', breed: 'Сибирская', age_years: 3, neutered: true }), TODAY)
    expect(facts.meta).toBe('Кошка · Сибирская · 3 года')
    expect(facts.neutered).toBe('Стерилизована')
  })

  it('says nothing about neutering that the owner has not said', () => {
    expect(headerFacts(ru, overview({ neutered: false }), TODAY).neutered).toBeNull()
    expect(headerFacts(ru, overview({ neutered: null }), TODAY).neutered).toBeNull()
  })
})

describe('important to know', () => {
  it('is empty for a pet with no allergies, illnesses or medicines on file', () => {
    // An empty list is "not said", never "no allergies" — MR-01.3.
    expect(importantFacts(ru, pet())).toEqual([])
  })

  it('lists only what the form has, in the spec order', () => {
    const facts = importantFacts(
      ru,
      pet({ allergies: ['курица'], chronic_conditions: [], medications: ['Лечебный корм', 'Фортифлора'] }),
    )
    expect(facts).toEqual([
      { label: 'Аллергии', value: 'курица' },
      { label: 'Принимает сейчас', value: 'Лечебный корм, Фортифлора' },
    ])
  })
})

describe('sections', () => {
  it('lists the five sections in order; vaccinations and weight open so far', () => {
    const rows = sectionRows(ru, overview(), TODAY)
    expect(rows.map((row) => row.section)).toEqual(['vaccinations', 'parasites', 'visits', 'medications', 'weight'])
    expect(rows.filter((row) => row.openable).map((row) => row.section)).toEqual(['vaccinations', 'weight'])
  })

  it('sums vaccinations up with the last one done, over the form’s answer', () => {
    const done: HealthEvent = {
      id: 'd', kind: 'vaccination', status: 'done', date: '2026-03-12', clinic: null, notes: null,
      items: [{ id: 'i', name: null, targets: ['rabies'], source_item_id: null, product_id: null }],
    }
    expect(sectionRows(ru, overview({ vaccinated: false }, [], [done]), TODAY)[0].summary).toBe('Последняя — 12 марта 2026')
  })

  it('shows the form’s vaccination answer without inventing dates', () => {
    const [vaccinations] = sectionRows(ru, overview({ vaccinated: true }), TODAY)
    expect(vaccinations.summary).toBe('В анкете: привит(а), даты не указаны')
    expect(sectionRows(ru, overview({ vaccinated: false }), TODAY)[0].summary).toBe('В анкете: не привит(а)')
    expect(sectionRows(ru, overview({ vaccinated: null }), TODAY)[0].summary).toBe('Пока нет записей')
  })

  it('counts the form’s medicines as current and shows the form’s weight', () => {
    const rows = sectionRows(ru, overview({ medications: ['Лечебный корм'], weight_kg: 4.2 }), TODAY)
    expect(rows[3].summary).toBe('Сейчас: 1')
    expect(rows[4].summary).toBe('4,2 кг · из анкеты')
  })

  it('says a section is empty in words, not by leaving it blank', () => {
    const rows = sectionRows(ru, overview({ weight_kg: null }), TODAY)
    expect(rows[1].summary).toBe('Пока нет записей')
    expect(rows[2].summary).toBe('Пока нет записей')
    expect(rows[3].summary).toBe('Пока нет записей')
    expect(rows[4].summary).toBe('Пока нет записей')
  })

  it('does not open a section this build has no screen for, whatever the server allows', () => {
    // A newer server lists sections an older app cannot show: a chevron there
    // would be a button that leads nowhere.
    const rows = sectionRows(ru, { pet: pet(), writable: ['weight', 'visits'], weights: [], events: [] }, TODAY)
    expect(rows.find((row) => row.section === 'visits')?.openable).toBe(false)
    expect(sectionRows(ru, { pet: pet(), writable: [], weights: [], events: [] }, TODAY)[4].openable).toBe(false)
  })
})

describe('weight in the record', () => {
  const history: WeightMeasurement[] = [
    { id: 'a', measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' },
    { id: 'b', measured_on: '2026-06-20', weight_kg: 4.4, source: 'record' },
    { id: 'c', measured_on: '2026-03-12', weight_kg: 4.5, source: 'record' },
  ]

  it('shows the trend under the weight once there is one', () => {
    const facts = headerFacts(ru, overview({ weight_kg: 4.2 }, history), TODAY)
    expect(facts.weight).toBe('4,2 кг')
    expect(facts.weightNote).toBe('−0,3 кг за 6 месяцев')
  })

  it('shows the day of a lone measurement, and «Из анкеты» for the form’s own', () => {
    expect(headerFacts(ru, overview({ weight_kg: 4.2 }, [history[0]]), TODAY).weightNote).toBe('12 сентября')
    const legacy = [{ id: 'l', measured_on: null, weight_kg: 28, source: 'form' as const }]
    expect(headerFacts(ru, overview({ weight_kg: 28 }, legacy), TODAY).weightNote).toBe('Из анкеты')
  })

  it('sums the section up with the latest dated weight', () => {
    expect(sectionRows(ru, overview({ weight_kg: 4.2 }, history), TODAY)[4].summary).toBe('4,2 кг · 12 сентября')
    expect(sectionRows(ru, overview({ weight_kg: 4.2 }, [{ ...history[0], measured_on: '2025-09-12' }]), TODAY)[4].summary)
      .toBe('4,2 кг · 12 сентября 2025')
  })
})
