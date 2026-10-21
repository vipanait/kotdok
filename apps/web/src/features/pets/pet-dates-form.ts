import { CalendarDateSchema } from '@lapka/contracts'
import { approxBirthDate, monthsBetween, petAgeYears } from '@lapka/shared'
import type { Pet } from '@/shared/types'

/**
 * The pet form's «Даты» (FB-2/01, design `pet-form`): a birth date known
 * exactly or an age estimated in years and months, and the first day
 * together. The phone's rules (apps/mobile pet-form.ts), with the site's
 * date fields (`YYYY-MM-DD`). Opening and saving the form untouched never
 * changes a date: an estimate keeps its own day, an age saved before there
 * were dates stays an age, and nothing is invented.
 */

export type BirthMode = 'exact' | 'approx'

export type PetDatesFields = {
  birthMode: BirthMode
  /** `YYYY-MM-DD` from the date field, or empty. */
  birthDate: string
  approxYears: string
  approxMonths: string
  /** The estimated birth date the pet was saved with, or empty. */
  storedBirthDate: string
  /** The age of a pet saved before there were dates (`age_years`, no birth date). */
  storedAge: number | null
  adoptedOn: string
}

export type PetDatesValue = {
  birth_date: string | null
  birth_date_approx: boolean
  adopted_on: string | null
  /** Still sent: older apps read the age, not the date. */
  age_years: number | null
}

export type PetDatesError = {
  field: 'birthDate' | 'approxYears' | 'approxMonths' | 'adoptedOn'
  reason: 'dayPast' | 'birthTooOld' | 'ageRange' | 'monthsRange' | 'adoptedBeforeBirth'
}

/** The contract's bound on `age_years`. */
export const AGE_MAX = 50

type PetDates = Pick<Pet, 'birth_date' | 'birth_date_approx' | 'age_years' | 'adopted_on'>

export function datesFromPet(pet: PetDates | undefined, today: string): PetDatesFields {
  const exact = !pet || (pet.birth_date !== null && !pet.birth_date_approx) || (pet.birth_date === null && pet.age_years === null)
  const months = !pet
    ? null
    : pet.birth_date
      ? monthsBetween(pet.birth_date, today)
      : pet.age_years === null
        ? null
        : Math.round(pet.age_years * 12)
  return {
    birthMode: exact ? 'exact' : 'approx',
    birthDate: exact && pet?.birth_date ? pet.birth_date : '',
    approxYears: exact || months === null ? '' : String(Math.floor(months / 12)),
    approxMonths: exact || months === null ? '' : String(months % 12),
    storedBirthDate: pet && !exact && pet.birth_date ? pet.birth_date : '',
    storedAge: pet && pet.birth_date === null ? pet.age_years : null,
    adoptedOn: pet?.adopted_on ?? '',
  }
}

function isDay(value: string): boolean {
  return CalendarDateSchema.safeParse(value).success
}

function wholeNumber(text: string, max: number): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: null }
  if (!/^\d+$/.test(trimmed)) return { ok: false }
  const value = Number(trimmed)
  return value <= max ? { ok: true, value } : { ok: false }
}

function readBirth(fields: PetDatesFields, today: string): ({ ok: true; date: string | null; age?: number | null }) | ({ ok: false } & PetDatesError) {
  if (fields.birthMode === 'exact') {
    const day = fields.birthDate.trim()
    if (day === '') return { ok: true, date: null }
    if (!isDay(day) || day > today) return { ok: false, field: 'birthDate', reason: 'dayPast' }
    if (monthsBetween(day, today) > AGE_MAX * 12) return { ok: false, field: 'birthDate', reason: 'birthTooOld' }
    return { ok: true, date: day }
  }

  const years = wholeNumber(fields.approxYears, AGE_MAX)
  if (!years.ok) return { ok: false, field: 'approxYears', reason: 'ageRange' }
  const months = wholeNumber(fields.approxMonths, 11)
  if (!months.ok) return { ok: false, field: 'approxMonths', reason: 'monthsRange' }
  if (years.value === null && months.value === null) return { ok: true, date: null }
  const total = (years.value ?? 0) * 12 + (months.value ?? 0)
  if (total > AGE_MAX * 12) return { ok: false, field: 'approxYears', reason: 'ageRange' }
  // The same estimate as saved: its day stays.
  if (fields.storedBirthDate && monthsBetween(fields.storedBirthDate, today) === total) {
    return { ok: true, date: fields.storedBirthDate }
  }
  // An age from before there were dates, untouched: still an age, not a day.
  if (!fields.storedBirthDate && fields.storedAge !== null && Math.round(fields.storedAge * 12) === total) {
    return { ok: true, date: null, age: fields.storedAge }
  }
  return { ok: true, date: approxBirthDate(years.value ?? 0, months.value ?? 0, today) }
}

/** What «Сохранить» sends about the dates, or the field to complain about. */
export function readPetDates(fields: PetDatesFields, today: string): ({ ok: true; value: PetDatesValue }) | ({ ok: false } & PetDatesError) {
  const birth = readBirth(fields, today)
  if (!birth.ok) return birth

  const home = fields.adoptedOn.trim()
  if (home !== '' && (!isDay(home) || home > today)) return { ok: false, field: 'adoptedOn', reason: 'dayPast' }
  if (home !== '' && birth.date && home < birth.date) return { ok: false, field: 'adoptedOn', reason: 'adoptedBeforeBirth' }

  return {
    ok: true,
    value: {
      birth_date: birth.date,
      birth_date_approx: birth.date !== null && fields.birthMode === 'approx',
      adopted_on: home === '' ? null : home,
      age_years: birth.date ? petAgeYears({ birth_date: birth.date, age_years: null }, today) : (birth.age ?? null),
    },
  }
}

/**
 * «Знаю дату» → «Примерно»: a typed date becomes its years and months, so
 * saving after the switch keeps the age. The other way leaves the date
 * empty — an estimate is not a day.
 */
export function switchBirthMode(fields: PetDatesFields, mode: BirthMode, today: string): PetDatesFields {
  if (mode === fields.birthMode) return fields
  if (mode === 'approx' && fields.approxYears.trim() === '' && fields.approxMonths.trim() === '') {
    const day = fields.birthDate.trim()
    if (isDay(day) && day <= today) {
      const months = monthsBetween(day, today)
      return { ...fields, birthMode: mode, approxYears: String(Math.floor(months / 12)), approxMonths: String(months % 12) }
    }
  }
  return { ...fields, birthMode: mode }
}
