import { describe, expect, it } from 'vitest'
import type { HealthOverview, Pet } from '@lapka/contracts'
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

function overview(overrides: Partial<Pet> = {}): HealthOverview {
  return { pet: pet(overrides), writable: [] }
}

describe('medical record header', () => {
  it('shows Бобик as the form describes him: 28 kg, from the form', () => {
    // MR-01.3
    const facts = headerFacts(ru, pet())
    expect(facts.meta).toBe('Собака · 5 лет')
    expect(facts.weight).toBe('28 кг')
    expect(facts.weightNote).toBe('Из анкеты')
    expect(facts.neutered).toBeNull()
  })

  it('writes a fractional weight the way the language does', () => {
    expect(headerFacts(ru, pet({ weight_kg: 4.2 })).weight).toBe('4,2 кг')
    expect(headerFacts(en, pet({ weight_kg: 4.2 })).weight).toBe('4.2 kg')
  })

  it('leaves the weight out rather than showing zero when the form has none', () => {
    expect(headerFacts(ru, pet({ weight_kg: null })).weight).toBeNull()
  })

  it('names the species even when the sex is known, in either language', () => {
    expect(headerFacts(ru, pet({ sex: 'female' })).meta).toBe('Собака · 5 лет')
    expect(headerFacts(en, pet({ species: 'cat', sex: 'female', breed: null })).meta).toBe('Cat · 5 years')
  })

  it('names the female cat and her neutering in the words the form uses', () => {
    const facts = headerFacts(ru, pet({ species: 'cat', sex: 'female', breed: 'Сибирская', age_years: 3, neutered: true }))
    expect(facts.meta).toBe('Кошка · Сибирская · 3 года')
    expect(facts.neutered).toBe('Стерилизована')
  })

  it('says nothing about neutering that the owner has not said', () => {
    expect(headerFacts(ru, pet({ neutered: false })).neutered).toBeNull()
    expect(headerFacts(ru, pet({ neutered: null })).neutered).toBeNull()
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
  it('lists the five sections in order, none openable before their stage', () => {
    const rows = sectionRows(ru, overview())
    expect(rows.map((row) => row.section)).toEqual(['vaccinations', 'parasites', 'visits', 'medications', 'weight'])
    expect(rows.every((row) => !row.openable)).toBe(true)
  })

  it('shows the form’s vaccination answer without inventing dates', () => {
    const [vaccinations] = sectionRows(ru, overview({ vaccinated: true }))
    expect(vaccinations.summary).toBe('В анкете: привит(а), даты не указаны')
    expect(sectionRows(ru, overview({ vaccinated: false }))[0].summary).toBe('В анкете: не привит(а)')
    expect(sectionRows(ru, overview({ vaccinated: null }))[0].summary).toBe('Пока нет записей')
  })

  it('counts the form’s medicines as current and shows the form’s weight', () => {
    const rows = sectionRows(ru, overview({ medications: ['Лечебный корм'], weight_kg: 4.2 }))
    expect(rows[3].summary).toBe('Сейчас: 1')
    expect(rows[4].summary).toBe('4,2 кг · из анкеты')
  })

  it('says a section is empty in words, not by leaving it blank', () => {
    const rows = sectionRows(ru, overview({ weight_kg: null }))
    expect(rows[1].summary).toBe('Пока нет записей')
    expect(rows[2].summary).toBe('Пока нет записей')
    expect(rows[3].summary).toBe('Пока нет записей')
    expect(rows[4].summary).toBe('Пока нет записей')
  })

  it('does not open a section this build has no screen for, whatever the server allows', () => {
    // A newer server lists sections an older app cannot show: a chevron there
    // would be a button that leads nowhere.
    const rows = sectionRows(ru, { pet: pet(), writable: ['weight', 'visits'] })
    expect(rows.every((row) => !row.openable)).toBe(true)
  })
})
