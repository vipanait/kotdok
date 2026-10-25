import type { Medication } from '@lapka/contracts'
import { courseValue, type ContractRefusal as SharedRefusal, type CoursesProblems as SharedProblems, type FormRead } from '@lapka/shared'

// Reading the courses is shared with the phone (@lapka/shared `form-readers.ts`):
// the same problems, as codes, and the same bodies.
export { courseProblems, readCourseChange, readNewCourses, type CourseProblems } from '@lapka/shared'

/**
 * The medicine form (web v1 «medication-new», «course-edit») as data, apart
 * from React so its rules are unit tested:
 *
 * - a new save holds one empty course at first, more by «Ещё препарат», up
 *   to ten; all of them are stored in one request, or none;
 * - a course: a name and «Как давать» up to 150 characters, a start (today
 *   by default), and either an end — optional, not before the start — or
 *   «Постоянно», which hides the end and sends none (a typed end is kept
 *   aside, not lost, should «Постоянно» be unticked);
 * - a current course is corrected alone and only what changed is sent; a
 *   finished one is never opened here (owner rule of 26 September 2026).
 *
 * The contract's schemas have the last word before anything is sent.
 */

export type CourseDraft = {
  /** Stable across renders and errors: the course's id, or a local key. */
  key: string
  name: string
  dosage: string
  /** yyyy-mm-dd, or '' when none is given. */
  start: string
  /** yyyy-mm-dd, or ''; not read while `ongoing`. */
  end: string
  ongoing: boolean
}

export function blankCourse(key: string, today: string): CourseDraft {
  return { key, name: '', dosage: '', start: today, end: '', ongoing: false }
}

/** A current course as the form opens it. */
export function draftFromCourse(course: Medication): CourseDraft {
  return {
    key: course.id,
    name: course.name,
    dosage: course.dosage ?? '',
    start: course.started_on ?? '',
    end: course.ended_on ?? '',
    ongoing: course.ongoing,
  }
}

export type CoursesProblems = SharedProblems

/** The form built something the contract refuses: said as a banner, never thrown. */
export type ContractRefusal = SharedRefusal<CoursesProblems>

export type CourseRead<T> = FormRead<T, CoursesProblems>

/** Whether leaving the form loses anything. */
export function coursesChanged(initial: readonly CourseDraft[], drafts: readonly CourseDraft[]): boolean {
  const read = (list: readonly CourseDraft[]) =>
    JSON.stringify(list.map((draft) => ({ ...courseValue(draft), end: draft.end, key: undefined })))
  return read(initial) !== read(drafts)
}
