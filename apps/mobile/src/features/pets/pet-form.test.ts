import { describe, expect, it } from 'vitest'
import {
  AGE_MAX,
  LIST_MAX_ITEMS,
  WEIGHT_MAX,
  emptyPetForm,
  formToInput,
  parseList,
  parseOptionalNumber,
  petToForm,
  type PetForm,
} from './pet-form'

function filled(overrides: Partial<PetForm> = {}): PetForm {
  return { ...emptyPetForm(), name: 'Барсик', ...overrides }
}

describe('pet form', () => {
  it('sends a name and leaves the untouched fields empty rather than zero', () => {
    const result = formToInput(filled())

    expect(result).toMatchObject({
      ok: true,
      value: { name: 'Барсик', species: 'cat', age_years: null, weight_kg: null, breed: null },
    })
  })

  it('refuses a name of only spaces, which the field makes easy to type', () => {
    expect(formToInput(filled({ name: '   ' }))).toEqual({
      ok: false,
      field: 'name',
      message: 'Введите имя питомца',
    })
  })

  it('accepts a comma as the decimal separator, because the keyboard offers it', () => {
    expect(parseOptionalNumber('4,5', WEIGHT_MAX)).toEqual({ ok: true, value: 4.5 })
  })

  it('tells an empty field apart from a zero', () => {
    expect(parseOptionalNumber('', AGE_MAX)).toEqual({ ok: true, value: null })
    expect(parseOptionalNumber('0', AGE_MAX)).toEqual({ ok: true, value: 0 })
  })

  it('refuses what is not a number, and what is out of range', () => {
    expect(parseOptionalNumber('около трёх', AGE_MAX).ok).toBe(false)
    expect(parseOptionalNumber('-1', AGE_MAX).ok).toBe(false)
    expect(parseOptionalNumber(String(AGE_MAX + 1), AGE_MAX).ok).toBe(false)
  })

  it('names the field that is wrong, so the screen can point at it', () => {
    expect(formToInput(filled({ ageYears: 'три' }))).toMatchObject({
      ok: false,
      field: 'ageYears',
    })
    expect(formToInput(filled({ weightKg: '500' }))).toMatchObject({
      ok: false,
      field: 'weightKg',
    })
  })

  it('reads a list the way people type one', () => {
    expect(parseList(' курица ,рыба,  , говядина ')).toEqual(['курица', 'рыба', 'говядина'])
  })

  it('stops at the limit instead of having the server refuse the whole pet', () => {
    const many = Array.from({ length: LIST_MAX_ITEMS + 5 }, (_, index) => `a${index}`).join(',')

    expect(parseList(many)).toHaveLength(LIST_MAX_ITEMS)
  })

  it('drops dog-only fields for a cat, which the contract rejects outright', () => {
    const result = formToInput(filled({ species: 'cat', sizeClass: 'large', walkActivity: 'sport' }))

    expect(result).toMatchObject({ ok: true, value: { size_class: null, walk_activity: null } })
  })

  it('keeps dog-only fields for a dog', () => {
    const result = formToInput(filled({ species: 'dog', sizeClass: 'large', walkActivity: 'sport' }))

    expect(result).toMatchObject({
      ok: true,
      value: { size_class: 'large', walk_activity: 'sport' },
    })
  })

  it('round-trips a pet through the form without inventing values', () => {
    const pet = {
      id: '2f3d6ae3-d78f-473e-b077-4c43b8508dcd',
      species: 'dog' as const,
      name: 'Бобик',
      breed: 'Лабрадор',
      age_years: 3,
      weight_kg: 24.5,
      sex: 'male' as const,
      neutered: true,
      indoor_outdoor: 'both' as const,
      diet: 'dry' as const,
      size_class: 'large' as const,
      walk_activity: 'daily_long' as const,
      allergies: ['курица'],
      vaccinated: true,
      chronic_conditions: [],
      medications: ['витамины'],
      notes: 'боится грозы',
      created_at: '2026-09-06T11:51:53.000Z',
    }

    const result = formToInput(petToForm(pet))

    expect(result).toMatchObject({
      ok: true,
      value: {
        species: 'dog',
        name: 'Бобик',
        breed: 'Лабрадор',
        age_years: 3,
        weight_kg: 24.5,
        sex: 'male',
        neutered: true,
        indoor_outdoor: 'both',
        diet: 'dry',
        size_class: 'large',
        walk_activity: 'daily_long',
        allergies: ['курица'],
        vaccinated: true,
        chronic_conditions: [],
        medications: ['витамины'],
        notes: 'боится грозы',
      },
    })
  })
})
