import { WEIGHT_MAX_KG, type WeightInput, type WeightMeasurement, type WeightPatch } from '@lapka/contracts'
import {
  ApiError,
  ApiTimeoutError,
  WEIGHT_MIN_KG,
  isKeyReused,
  newWeightInput,
  weightCorrection,
  type WeightFormProblems,
} from '@lapka/shared'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatDecimal } from '../view-model'

/**
 * The weight form's words for what went wrong, apart from React so they are
 * unit tested. Field problems come from the shared reading of the fields
 * (@lapka/shared `newWeightInput` / `weightCorrection`, the contract's
 * bounds); a failed request is sorted into what the owner can do about it.
 */

export type FieldErrors = { weight?: string; day?: string }

export function fieldErrors(dict: Dictionary, problems: WeightFormProblems): FieldErrors {
  const words = dict.medicalRecord
  const errors = words.weightForm.errors
  return {
    weight:
      problems.weight === 'empty'
        ? errors.weightEmpty
        : problems.weight === 'invalid'
          ? errors.weightInvalid
              .replace('{min}', formatDecimal(words, WEIGHT_MIN_KG))
              .replace('{max}', formatDecimal(words, WEIGHT_MAX_KG))
          : undefined,
    day:
      problems.day === 'empty'
        ? errors.dayEmpty
        : problems.day === 'invalid'
          ? errors.dayInvalid
          : problems.day === 'future'
            ? errors.dayFuture
            : undefined,
  }
}

export type SaveFailure =
  /** The corrected day already has a measurement (409): the owner picks. */
  | 'dayTaken'
  /**
   * An earlier try of this save did reach the server, with the values it had
   * then (409, the save's Idempotency-Key used for other data): nothing new
   * was stored, and the history shows what was.
   */
  | 'alreadySaved'
  /** The server refused the values (400): the client check and the contract disagree. */
  | 'rejected'
  /** The measurement or the pet is no longer there (404). */
  | 'gone'
  | 'signedOut'
  /** The account is being deleted: the cabinet closes. */
  | 'deleting'
  /** No answer: offline, or the request timed out. The form keeps everything. */
  | 'offline'
  | 'failed'

export function saveFailure(error: unknown): SaveFailure {
  if (isKeyReused(error)) return 'alreadySaved'
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'conflict':
        return 'dayTaken'
      case 'bad_request':
        return 'rejected'
      case 'not_found':
        return 'gone'
      case 'unauthorized':
        return 'signedOut'
      case 'account_deleting':
        return 'deleting'
      default:
        return 'failed'
    }
  }
  // fetch rejects with a TypeError when there is no network; the client's own timeout is ApiTimeoutError.
  if (error instanceof TypeError || error instanceof ApiTimeoutError) return 'offline'
  return 'failed'
}

/** The banner under the fields for a failed save; a taken day is said at the date field instead. */
export function saveFailureText(dict: Dictionary, failure: Exclude<SaveFailure, 'dayTaken' | 'deleting'>): string {
  const errors = dict.medicalRecord.weightForm.errors
  return errors[failure]
}

/**
 * What «Сохранить» does with the fields as they stand, before any request:
 * refuse them (the errors, and the field to move to — the weight first), go
 * back with nothing to save (a correction that changes nothing), or send the
 * new measurement or the change. A stored value left as it opened is sent as
 * it is — 4,25 from the pet form is not refused for its second decimal (MW-09).
 */
export type WeightSaveStep =
  | { step: 'invalid'; errors: FieldErrors; focus: 'weight' | 'day' }
  | { step: 'unchanged' }
  | { step: 'add'; input: WeightInput }
  | { step: 'change'; patch: WeightPatch }

export function weightSaveStep(
  dict: Dictionary,
  fields: { editing: WeightMeasurement | null; weightText: string; day: string; today: string; formWeight: number | null },
): WeightSaveStep {
  const { editing, weightText, day, today, formWeight } = fields
  const read = editing ? weightCorrection(editing, weightText, day, today) : newWeightInput(weightText, day, today, formWeight)
  if (!read.ok) {
    const errors = fieldErrors(dict, read.problems)
    return { step: 'invalid', errors, focus: errors.weight ? 'weight' : 'day' }
  }
  if ('patch' in read) return read.patch === null ? { step: 'unchanged' } : { step: 'change', patch: read.patch }
  return { step: 'add', input: read.input }
}

/**
 * What the form shows for a save that failed — every field stays as typed:
 * a taken day at the date field, the account being deleted leaves the
 * cabinet, anything else is the banner under the fields.
 */
export type WeightFailureView = { leave: '/account-deletion' } | { dayError: string } | { banner: string }

export function weightFailureView(dict: Dictionary, failure: SaveFailure): WeightFailureView {
  if (failure === 'deleting') return { leave: '/account-deletion' }
  if (failure === 'dayTaken') return { dayError: dict.medicalRecord.weightForm.errors.dayTaken }
  return { banner: saveFailureText(dict, failure) }
}
