/**
 * Turning what a person typed into what the contract accepts.
 *
 * Kept apart from the screen so it can be tested: every rule here is one the
 * server will otherwise enforce with a 400 the user has to guess at. The form
 * holds strings because that is what a text field gives you; this module is
 * where they become numbers, lists and nulls — or a named complaint.
 */

import type { Dictionary } from '@/i18n'
import { approxBirthDate, monthsBetween, petAgeYears } from '@lapka/shared'
import { dayInput, parseDayText } from '@/lib/calendar-day'
import {
  PET_DIETS,
  PET_LIFESTYLES,
  PET_SEXES,
  PET_SIZE_CLASSES,
  PET_SPECIES,
  PET_WALK_ACTIVITIES,
  type Pet,
  type PetCreateInput,
} from '@lapka/contracts'

export type Species = (typeof PET_SPECIES)[number]

/** What the screen holds: text as typed, choices as the value or null. */
export type PetForm = {
  species: Species
  name: string
  breed: string
  /**
   * The birth date (FB-2/01): a day as typed (ДД.ММ.ГГГГ), or «about N years
   * M months» — an estimate, kept as the day it stands for so the age grows.
   */
  birthMode: 'exact' | 'approx'
  birthDate: string
  approxYears: string
  approxMonths: string
  /** The first day together, ДД.ММ.ГГГГ; empty when not given. */
  adoptedOn: string
  weightKg: string
  sex: (typeof PET_SEXES)[number] | null
  neutered: boolean | null
  indoorOutdoor: (typeof PET_LIFESTYLES)[number] | null
  diet: (typeof PET_DIETS)[number] | null
  sizeClass: (typeof PET_SIZE_CLASSES)[number] | null
  walkActivity: (typeof PET_WALK_ACTIVITIES)[number] | null
  /** One item per line as typed; empty lines are dropped when the form is read (FB-1/06). */
  allergies: string[]
  vaccinated: boolean | null
  chronicConditions: string[]
  medications: string[]
  notes: string
}

export const emptyPetForm = (species: Species = 'cat'): PetForm => ({
  species,
  name: '',
  breed: '',
  birthMode: 'approx',
  birthDate: '',
  approxYears: '',
  approxMonths: '',
  adoptedOn: '',
  weightKg: '',
  sex: null,
  neutered: null,
  indoorOutdoor: null,
  diet: null,
  sizeClass: null,
  walkActivity: null,
  allergies: [],
  vaccinated: null,
  chronicConditions: [],
  medications: [],
  notes: '',
})

export function petToForm(pet: Pet, today: string): PetForm {
  // An exact date opens as one; an estimate, or an age typed before there
  // were dates, opens as years and months on today's calendar.
  const exact = pet.birth_date !== null && !pet.birth_date_approx
  const months = pet.birth_date
    ? monthsBetween(pet.birth_date, today)
    : pet.age_years === null
      ? null
      : Math.round(pet.age_years * 12)
  return {
    species: pet.species,
    name: pet.name,
    breed: pet.breed ?? '',
    birthMode: exact ? 'exact' : 'approx',
    birthDate: exact && pet.birth_date ? dayInput(pet.birth_date) : '',
    approxYears: exact || months === null ? '' : String(Math.floor(months / 12)),
    approxMonths: exact || months === null ? '' : String(months % 12),
    adoptedOn: pet.adopted_on ? dayInput(pet.adopted_on) : '',
    weightKg: pet.weight_kg === null ? '' : String(pet.weight_kg),
    sex: pet.sex,
    neutered: pet.neutered,
    indoorOutdoor: pet.indoor_outdoor,
    diet: pet.diet,
    sizeClass: pet.size_class,
    walkActivity: pet.walk_activity,
    allergies: [...pet.allergies],
    vaccinated: pet.vaccinated,
    chronicConditions: [...pet.chronic_conditions],
    medications: [...pet.medications],
    notes: pet.notes ?? '',
  }
}

/** Whether anything a person could see differs — what "unsaved changes" means. */
export function petFormChanged(before: PetForm, after: PetForm): boolean {
  return (Object.keys(before) as (keyof PetForm)[]).some((key) => {
    const was = before[key]
    const is = after[key]
    return Array.isArray(was) || Array.isArray(is) ? JSON.stringify(was) !== JSON.stringify(is) : was !== is
  })
}

export const LIST_MAX_ITEMS = 20

/** The lines of a list field as the contract keeps them: trimmed, none empty, at most the limit. */
export function parseList(rows: readonly string[]): string[] {
  return rows
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, LIST_MAX_ITEMS)
}

export type NumberResult = { ok: true; value: number | null } | { ok: false }

/**
 * An empty field means "not stated", not zero — the contract distinguishes
 * them, and a pet with no weight recorded is not a pet weighing nothing.
 */
export function parseOptionalNumber(text: string, max: number): NumberResult {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return { ok: true, value: null }

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0 || value > max) return { ok: false }
  return { ok: true, value }
}

export const AGE_MAX = 50
export const WEIGHT_MAX = 200

/** A complaint about one field, shown under that field. */
export type FieldError = { field: keyof PetForm; message: string }

export type FormResult = { ok: true; value: PetCreateInput } | ({ ok: false } & FieldError)

/**
 * The complaint still standing after an edit.
 *
 * Touching the field it is about retires it: the person is fixing it, and a red
 * line under what they are typing reads as the new text being wrong too.
 */
export function remainingError(
  error: FieldError | null,
  patch: Partial<PetForm>,
): FieldError | null {
  return error && error.field in patch ? null : error
}

/**
 * @returns what to send, or the first field to complain about.
 *
 * Dog-only fields are dropped for a cat rather than sent and refused: the
 * contract rejects them outright, and a person who once filled them in for a
 * dog should not be blocked by a value they can no longer see.
 */
export function formToInput(t: Dictionary, form: PetForm, today: string): FormResult {
  const name = form.name.trim()
  if (name === '') return { ok: false, field: 'name', message: t.validation.nameRequired }

  const birth = readBirth(t, form, today)
  if (!birth.ok) return birth

  const adoptedOn = form.adoptedOn.trim() === '' ? null : parseDayText(form.adoptedOn)
  if (form.adoptedOn.trim() !== '' && (adoptedOn === null || adoptedOn > today)) {
    return { ok: false, field: 'adoptedOn', message: t.validation.dayPast }
  }
  if (adoptedOn && birth.date && adoptedOn < birth.date) {
    return { ok: false, field: 'adoptedOn', message: t.validation.adoptedBeforeBirth }
  }

  const weight = parseOptionalNumber(form.weightKg, WEIGHT_MAX)
  if (!weight.ok) {
    return { ok: false, field: 'weightKg', message: t.validation.weightRange(WEIGHT_MAX) }
  }

  const isDog = form.species === 'dog'

  return {
    ok: true,
    value: {
      species: form.species,
      name,
      breed: form.breed.trim() || null,
      // Still sent: the site and older apps read the age, not the date.
      age_years: birth.date ? petAgeYears({ birth_date: birth.date, age_years: null }, today) : null,
      birth_date: birth.date,
      birth_date_approx: birth.date !== null && form.birthMode === 'approx',
      adopted_on: adoptedOn,
      weight_kg: weight.value,
      sex: form.sex,
      neutered: form.neutered,
      indoor_outdoor: form.indoorOutdoor,
      diet: form.diet,
      size_class: isDog ? form.sizeClass : null,
      walk_activity: isDog ? form.walkActivity : null,
      allergies: parseList(form.allergies),
      vaccinated: form.vaccinated,
      chronic_conditions: parseList(form.chronicConditions),
      medications: parseList(form.medications),
      notes: form.notes.trim() || null,
    },
  }
}

/** The birth date the form describes, or the field to complain about. */
function readBirth(t: Dictionary, form: PetForm, today: string): ({ ok: true; date: string | null }) | ({ ok: false } & FieldError) {
  if (form.birthMode === 'exact') {
    if (form.birthDate.trim() === '') return { ok: true, date: null }
    const date = parseDayText(form.birthDate)
    if (date === null || date > today) return { ok: false, field: 'birthDate', message: t.validation.dayPast }
    return { ok: true, date }
  }

  const years = parseOptionalNumber(form.approxYears, AGE_MAX)
  if (!years.ok || (years.value !== null && !Number.isInteger(years.value))) {
    return { ok: false, field: 'approxYears', message: t.validation.ageRange(AGE_MAX) }
  }
  const months = parseOptionalNumber(form.approxMonths, 11)
  if (!months.ok || (months.value !== null && !Number.isInteger(months.value))) {
    return { ok: false, field: 'approxMonths', message: t.validation.monthsRange }
  }
  if (years.value === null && months.value === null) return { ok: true, date: null }
  return { ok: true, date: approxBirthDate(years.value ?? 0, months.value ?? 0, today) }
}
