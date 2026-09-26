import { MEDICATION_LIMITS } from '@lapka/contracts'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { CourseProblems, CoursesProblems } from './course-form'

/**
 * The course form's words for what is wrong, apart from React so they are
 * unit tested. The limits in the sentences are the contract's.
 */

export type CourseErrorTexts = { name?: string; dosage?: string; start?: string; end?: string }

function courseTexts(dict: Dictionary, problems: CourseProblems): CourseErrorTexts {
  const errors = dict.medicalRecord.courseForm.errors
  return {
    name:
      problems.name === 'empty'
        ? errors.nameEmpty
        : problems.name === 'tooLong'
          ? errors.nameTooLong.replace('{max}', String(MEDICATION_LIMITS.name))
          : undefined,
    dosage: problems.dosage ? errors.dosageTooLong.replace('{max}', String(MEDICATION_LIMITS.dosage)) : undefined,
    start: problems.start === 'empty' ? errors.startEmpty : problems.start === 'invalid' ? errors.dayInvalid : undefined,
    end: problems.end === 'beforeStart' ? errors.endBeforeStart : problems.end === 'invalid' ? errors.dayInvalid : undefined,
  }
}

export function courseErrorTexts(
  dict: Dictionary,
  problems: CoursesProblems,
): { items?: string; course: Record<string, CourseErrorTexts> } {
  const form = dict.medicalRecord.courseForm
  return {
    items:
      problems.items === 'none'
        ? form.errors.itemsNone
        : problems.items === 'tooMany'
          ? form.itemsFull.replace('{max}', String(MEDICATION_LIMITS.items))
          : undefined,
    course: Object.fromEntries(Object.entries(problems.course ?? {}).map(([key, found]) => [key, courseTexts(dict, found)])),
  }
}
