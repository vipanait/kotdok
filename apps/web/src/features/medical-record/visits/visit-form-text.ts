import { VISIT_LIMITS } from '@lapka/contracts'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { VisitProblems } from './visit-form'

/**
 * The visit form's words for what is wrong, apart from React so they are
 * unit tested. The limits in the sentences are the contract's.
 */

export type PrescriptionErrorTexts = { name?: string; instructions?: string }

export type VisitErrorTexts = {
  date?: string
  clinic?: string
  reason?: string
  diagnosis?: string
  notes?: string
  prescriptions?: string
  prescription: Record<string, PrescriptionErrorTexts>
}

export function visitErrorTexts(dict: Dictionary, problems: VisitProblems): VisitErrorTexts {
  const errors = dict.medicalRecord.visitForm.errors
  const tooLong = (field: 'clinic' | 'reason' | 'diagnosis' | 'notes', text: string) =>
    problems.texts?.includes(field) ? text.replace('{max}', String(VISIT_LIMITS[field])) : undefined
  return {
    date:
      problems.date === 'empty'
        ? errors.dayEmpty
        : problems.date === 'invalid'
          ? errors.dayInvalid
          : problems.date === 'future'
            ? errors.dayFuture
            : problems.date === 'past'
              ? errors.dayPast
              : undefined,
    clinic: tooLong('clinic', errors.clinicTooLong),
    reason: tooLong('reason', errors.reasonTooLong),
    diagnosis: tooLong('diagnosis', errors.diagnosisTooLong),
    notes: tooLong('notes', errors.notesTooLong),
    prescriptions:
      problems.prescriptions === 'tooMany'
        ? dict.medicalRecord.visitForm.prescriptionsFull.replace('{max}', String(VISIT_LIMITS.prescriptions))
        : undefined,
    prescription: Object.fromEntries(
      Object.entries(problems.prescription ?? {}).map(([key, found]) => [
        key,
        {
          name:
            found.name === 'empty'
              ? errors.nameEmpty
              : found.name === 'tooLong'
                ? errors.nameTooLong.replace('{max}', String(VISIT_LIMITS.prescriptionName))
                : undefined,
          instructions: found.instructions ? errors.instructionsTooLong.replace('{max}', String(VISIT_LIMITS.instructions)) : undefined,
        },
      ]),
    ),
  }
}
