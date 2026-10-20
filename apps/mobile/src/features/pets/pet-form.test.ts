import { describe, expect, it } from 'vitest'
import type { Pet } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import {
  AGE_MAX,
  LIST_MAX_ITEMS,
  WEIGHT_MAX,
  emptyPetForm,
  formToInput,
  parseList,
  parseOptionalNumber,
  petFormChanged,
  petToForm,
  remainingError,
  type PetForm,
} from './pet-form'

const TODAY = '2026-10-20'

function filled(overrides: Partial<PetForm> = {}): PetForm {
  return { ...emptyPetForm(), name: 'Барсик', ...overrides }
}

describe('pet form', () => {
  it('sends a name and leaves the untouched fields empty rather than zero', () => {
    const result = formToInput(ru, filled(), TODAY)

    expect(result).toMatchObject({
      ok: true,
      value: { name: 'Барсик', species: 'cat', age_years: null, weight_kg: null, breed: null, birth_date: null, adopted_on: null },
    })
  })

  it('refuses a name of only spaces, which the field makes easy to type', () => {
    expect(formToInput(ru, filled({ name: '   ' }), TODAY)).toEqual({
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
    expect(formToInput(ru, filled({ approxYears: 'три' }), TODAY)).toMatchObject({
      ok: false,
      field: 'approxYears',
    })
    expect(formToInput(ru, filled({ weightKg: '500' }), TODAY)).toMatchObject({
      ok: false,
      field: 'weightKg',
    })
  })

  it('reads a list one item per line, keeping a comma inside an item (FB-1/06)', () => {
    expect(parseList([' курица ', '', '  ', 'рыба, кроме лосося'])).toEqual(['курица', 'рыба, кроме лосося'])
  })

  it('stops at the limit instead of having the server refuse the whole pet', () => {
    const many = Array.from({ length: LIST_MAX_ITEMS + 5 }, (_, index) => `a${index}`)

    expect(parseList(many)).toHaveLength(LIST_MAX_ITEMS)
  })

  it('sees an edited list line as a change, and an untouched list as none', () => {
    const start = { ...emptyPetForm(), allergies: ['курица'] }

    expect(petFormChanged(start, { ...start, allergies: ['курица'] })).toBe(false)
    expect(petFormChanged(start, { ...start, allergies: ['курица', ''] })).toBe(true)
  })

  it('drops dog-only fields for a cat, which the contract rejects outright', () => {
    const result = formToInput(ru, filled({ species: 'cat', sizeClass: 'large', walkActivity: 'sport' }), TODAY)

    expect(result).toMatchObject({ ok: true, value: { size_class: null, walk_activity: null } })
  })

  it('keeps dog-only fields for a dog', () => {
    const result = formToInput(ru, filled({ species: 'dog', sizeClass: 'large', walkActivity: 'sport' }), TODAY)

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
      birth_date: null,
      birth_date_approx: false,
      adopted_on: null,
      created_at: '2026-09-06T11:51:53.000Z',
    }

    const result = formToInput(ru, petToForm(pet, TODAY), TODAY)

    expect(result).toMatchObject({
      ok: true,
      value: {
        species: 'dog',
        name: 'Бобик',
        breed: 'Лабрадор',
        age_years: 3,
        birth_date: '2023-10-20',
        birth_date_approx: true,
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

  it('drops a complaint once its own field is edited, and keeps it for edits elsewhere', () => {
    const missingName = { field: 'name' as const, message: 'Введите имя питомца' }

    expect(remainingError(missingName, { name: 'Б' })).toBeNull()
    expect(remainingError(missingName, { breed: 'Сибирская' })).toBe(missingName)
    expect(remainingError(null, { name: 'Б' })).toBeNull()
  })

  it('counts a form as changed only when a value differs from where it started', () => {
    const start = filled()

    expect(petFormChanged(start, { ...start })).toBe(false)
    expect(petFormChanged(start, { ...start, notes: 'боится грозы' })).toBe(true)
    expect(petFormChanged(start, { ...start, neutered: false })).toBe(true)
  })

  it('turns «about 4 years 6 months» into an approximate birth date and the age it gives (FB-2/01)', () => {
    expect(formToInput(ru, filled({ birthMode: 'approx', approxYears: '4', approxMonths: '6' }), TODAY)).toMatchObject({
      ok: true,
      value: { birth_date: '2022-04-20', birth_date_approx: true, age_years: 4.5 },
    })
  })

  it('takes an exact birth date and the home day as typed (FB-2/01)', () => {
    expect(
      formToInput(ru, filled({ birthMode: 'exact', birthDate: '20.10.2020', adoptedOn: '01.12.2020' }), TODAY),
    ).toMatchObject({
      ok: true,
      value: { birth_date: '2020-10-20', birth_date_approx: false, age_years: 6, adopted_on: '2020-12-01' },
    })
  })

  it('refuses a birth date ahead, a home day before the birth, and months past eleven (FB-2/01)', () => {
    expect(formToInput(ru, filled({ birthMode: 'exact', birthDate: '21.10.2026' }), TODAY)).toMatchObject({ ok: false, field: 'birthDate' })
    expect(
      formToInput(ru, filled({ birthMode: 'exact', birthDate: '20.10.2020', adoptedOn: '19.10.2020' }), TODAY),
    ).toMatchObject({ ok: false, field: 'adoptedOn' })
    expect(formToInput(ru, filled({ adoptedOn: '21.10.2026' }), TODAY)).toMatchObject({ ok: false, field: 'adoptedOn' })
    expect(formToInput(ru, filled({ birthMode: 'approx', approxMonths: '12' }), TODAY)).toMatchObject({ ok: false, field: 'approxMonths' })
  })

  it('opens an exact birth date as one, and an estimate as years and months (FB-2/01)', () => {
    const base = { ...petToForm(sample(), TODAY) }
    expect(base).toMatchObject({ birthMode: 'approx', approxYears: '3', approxMonths: '0' })
    expect(petToForm(sample({ birth_date: '2020-10-20' }), TODAY)).toMatchObject({ birthMode: 'exact', birthDate: '20.10.2020' })
    expect(petToForm(sample({ birth_date: '2022-04-20', birth_date_approx: true }), TODAY)).toMatchObject({
      birthMode: 'approx',
      approxYears: '4',
      approxMonths: '6',
    })
    expect(petToForm(sample({ adopted_on: '2021-01-10' }), TODAY)).toMatchObject({ adoptedOn: '10.01.2021' })
  })
})

describe('the birth date across saves (FB-2 review)', () => {
  it('keeps an estimated birth date that the years and months still describe on a later day', () => {
    const later = '2026-11-19'
    const form = petToForm(sample({ birth_date: '2022-04-20', birth_date_approx: true }), later)
    expect(form).toMatchObject({ approxYears: '4', approxMonths: '6' })
    expect(formToInput(ru, form, later)).toMatchObject({ ok: true, value: { birth_date: '2022-04-20', birth_date_approx: true } })
  })

  it('counts from today once the owner changes the estimate', () => {
    const later = '2026-11-19'
    const form = { ...petToForm(sample({ birth_date: '2022-04-20', birth_date_approx: true }), later), approxYears: '5' }
    expect(formToInput(ru, form, later)).toMatchObject({ ok: true, value: { birth_date: '2021-05-19' } })
  })

  it('refuses a birth date that makes the pet older than the form allows, at its own field', () => {
    expect(formToInput(ru, filled({ birthMode: 'exact', birthDate: '01.01.1960' }), TODAY)).toMatchObject({ ok: false, field: 'birthDate' })
    expect(formToInput(ru, filled({ birthMode: 'approx', approxYears: '50', approxMonths: '6' }), TODAY)).toMatchObject({
      ok: false,
      field: 'approxYears',
    })
  })
})

function sample(overrides: Partial<Pet> = {}): Pet {
  return {
    id: '2f3d6ae3-d78f-473e-b077-4c43b8508dcd',
    species: 'cat',
    name: 'Мурка',
    breed: null,
    age_years: 3,
    weight_kg: null,
    sex: null,
    neutered: null,
    indoor_outdoor: null,
    diet: null,
    size_class: null,
    walk_activity: null,
    allergies: [],
    vaccinated: null,
    chronic_conditions: [],
    medications: [],
    notes: null,
    birth_date: null,
    birth_date_approx: false,
    adopted_on: null,
    created_at: '2026-09-06T11:51:53.000Z',
    ...overrides,
  }
}
