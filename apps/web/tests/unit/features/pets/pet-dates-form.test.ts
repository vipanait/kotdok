import { describe, expect, it } from 'vitest'
import { datesFromPet, readPetDates, switchBirthMode, type PetDatesFields } from '@/features/pets/pet-dates-form'

const TODAY = '2026-10-20'

const pet = (overrides: Partial<{ birth_date: string | null; birth_date_approx: boolean; age_years: number | null; adopted_on: string | null }> = {}) => ({
  birth_date: null,
  birth_date_approx: false,
  age_years: null,
  adopted_on: null,
  ...overrides,
})

const fields = (overrides: Partial<PetDatesFields> = {}): PetDatesFields => ({ ...datesFromPet(undefined, TODAY), ...overrides })

describe('the dates a pet form opens with', () => {
  it('a new pet starts on «Знаю дату рождения», empty', () => {
    expect(datesFromPet(undefined, TODAY)).toMatchObject({ birthMode: 'exact', birthDate: '', approxYears: '', approxMonths: '', adoptedOn: '' })
  })

  it('an exact birth date opens as the date', () => {
    expect(datesFromPet(pet({ birth_date: '2020-06-15', adopted_on: '2021-01-10' }), TODAY)).toMatchObject({
      birthMode: 'exact',
      birthDate: '2020-06-15',
      adoptedOn: '2021-01-10',
    })
  })

  it('an estimate opens as years and months on today’s calendar, never as a day', () => {
    expect(datesFromPet(pet({ birth_date: '2022-04-20', birth_date_approx: true }), TODAY)).toMatchObject({
      birthMode: 'approx',
      birthDate: '',
      approxYears: '4',
      approxMonths: '6',
    })
  })

  it('an age typed before there were dates opens as years and months', () => {
    expect(datesFromPet(pet({ age_years: 1.5 }), TODAY)).toMatchObject({ birthMode: 'approx', approxYears: '1', approxMonths: '6' })
  })
})

describe('saving without touching the dates loses nothing', () => {
  it('keeps an exact birth date and the home day', () => {
    const opened = pet({ birth_date: '2020-06-15', adopted_on: '2021-01-10', age_years: 6.3 })
    expect(readPetDates(datesFromPet(opened, TODAY), TODAY)).toEqual({
      ok: true,
      value: { birth_date: '2020-06-15', birth_date_approx: false, adopted_on: '2021-01-10', age_years: 6.3 },
    })
  })

  it('keeps an estimate’s own day, not a new one counted from today', () => {
    const opened = pet({ birth_date: '2022-04-03', birth_date_approx: true, age_years: 4.5 })
    expect(readPetDates(datesFromPet(opened, TODAY), TODAY)).toMatchObject({
      ok: true,
      value: { birth_date: '2022-04-03', birth_date_approx: true },
    })
  })

  it('keeps an older pet’s age as an age, inventing no birth date', () => {
    const opened = pet({ age_years: 3 })
    expect(readPetDates(datesFromPet(opened, TODAY), TODAY)).toEqual({
      ok: true,
      value: { birth_date: null, birth_date_approx: false, adopted_on: null, age_years: 3 },
    })
  })

  it('leaves a pet with no dates without dates', () => {
    expect(readPetDates(datesFromPet(pet(), TODAY), TODAY)).toEqual({
      ok: true,
      value: { birth_date: null, birth_date_approx: false, adopted_on: null, age_years: null },
    })
  })
})

describe('what the owner enters', () => {
  it('an exact date is sent as exact, with the age counted from it', () => {
    expect(readPetDates(fields({ birthDate: '2020-06-15' }), TODAY)).toEqual({
      ok: true,
      value: { birth_date: '2020-06-15', birth_date_approx: false, adopted_on: null, age_years: 6.3 },
    })
  })

  it('«Примерно» years and months become an estimated day that long ago', () => {
    expect(readPetDates(fields({ birthMode: 'approx', approxYears: '2', approxMonths: '3' }), TODAY)).toMatchObject({
      ok: true,
      value: { birth_date: '2024-07-20', birth_date_approx: true },
    })
  })

  it('a changed estimate gets a new day', () => {
    const opened = datesFromPet(pet({ birth_date: '2022-04-03', birth_date_approx: true }), TODAY)
    expect(readPetDates({ ...opened, approxYears: '5' }, TODAY)).toMatchObject({ ok: true, value: { birth_date: '2021-04-20' } })
  })

  it('refuses a birth or home day ahead of today, and a day that does not exist', () => {
    expect(readPetDates(fields({ birthDate: '2026-10-21' }), TODAY)).toMatchObject({ ok: false, field: 'birthDate', reason: 'dayPast' })
    expect(readPetDates(fields({ birthDate: '2026-02-30' }), TODAY)).toMatchObject({ ok: false, field: 'birthDate', reason: 'dayPast' })
    expect(readPetDates(fields({ adoptedOn: '2027-01-01' }), TODAY)).toMatchObject({ ok: false, field: 'adoptedOn', reason: 'dayPast' })
  })

  it('accepts today for both', () => {
    expect(readPetDates(fields({ birthDate: TODAY, adoptedOn: TODAY }), TODAY)).toMatchObject({ ok: true })
  })

  it('refuses a home day before the birth, as the contract does', () => {
    expect(readPetDates(fields({ birthDate: '2021-01-10', adoptedOn: '2020-06-15' }), TODAY)).toMatchObject({
      ok: false,
      field: 'adoptedOn',
      reason: 'adoptedBeforeBirth',
    })
  })

  it('takes the home day on the birthday', () => {
    expect(readPetDates(fields({ birthDate: '2021-01-10', adoptedOn: '2021-01-10' }), TODAY)).toMatchObject({ ok: true })
  })

  it('refuses an estimate past the contract’s 50 years, and months outside 0–11', () => {
    expect(readPetDates(fields({ birthMode: 'approx', approxYears: '51' }), TODAY)).toMatchObject({ ok: false, field: 'approxYears' })
    expect(readPetDates(fields({ birthMode: 'approx', approxYears: '1.5' }), TODAY)).toMatchObject({ ok: false, field: 'approxYears' })
    expect(readPetDates(fields({ birthMode: 'approx', approxMonths: '12' }), TODAY)).toMatchObject({ ok: false, field: 'approxMonths' })
  })

  it('refuses an exact birth over 50 years ago', () => {
    expect(readPetDates(fields({ birthDate: '1970-01-01' }), TODAY)).toMatchObject({ ok: false, field: 'birthDate', reason: 'birthTooOld' })
  })
})

describe('switching between «Знаю дату рождения» and «Примерно»', () => {
  it('a typed date becomes its years and months, so the age is kept', () => {
    expect(switchBirthMode(fields({ birthDate: '2024-07-20' }), 'approx', TODAY)).toMatchObject({
      birthMode: 'approx',
      approxYears: '2',
      approxMonths: '3',
    })
  })

  it('an estimate is not turned into a day', () => {
    expect(switchBirthMode(fields({ birthMode: 'approx', approxYears: '2' }), 'exact', TODAY)).toMatchObject({
      birthMode: 'exact',
      birthDate: '',
    })
  })
})
