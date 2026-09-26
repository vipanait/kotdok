import { WEIGHT_MAX_KG } from '@lapka/contracts'
import { ApiError, ApiTimeoutError, WEIGHT_MIN_KG, type WeightFormProblems } from '@lapka/shared'
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
