import {
  MEDICATION_LIMITS,
  MedicationPatchSchema,
  MedicationsInputSchema,
  type Medication,
  type MedicationPatch,
  type MedicationsInput,
} from '@lapka/contracts'
import { courseDayProblems, type CourseDayProblems } from '@lapka/shared'

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

export type CourseProblems = {
  name?: 'empty' | 'tooLong'
  dosage?: 'tooLong'
} & CourseDayProblems

export type CoursesProblems = {
  items?: 'none' | 'tooMany'
  course?: Record<string, CourseProblems>
}

/** The form built something the contract refuses: said as a banner, never thrown. */
export type ContractRefusal = { ok: false; rejected: true; problems: CoursesProblems }

export type CourseRead<T> = { ok: true; value: T } | { ok: false; rejected?: false; problems: CoursesProblems } | ContractRefusal

function problemsOf(draft: CourseDraft, startOptional: boolean): CourseProblems {
  const problems: CourseProblems = { ...courseDayProblems(draft, startOptional) }
  const name = draft.name.trim()
  if (name === '') problems.name = 'empty'
  else if (name.length > MEDICATION_LIMITS.name) problems.name = 'tooLong'
  if (draft.dosage.trim().length > MEDICATION_LIMITS.dosage) problems.dosage = 'tooLong'
  return problems
}

const hasProblems = (problems: CourseProblems) => Object.keys(problems).length > 0

/** One course as the contract takes it: empty texts and days are none, «Постоянно» has no end. */
function courseValue(draft: CourseDraft): MedicationsInput['items'][number] {
  const dosage = draft.dosage.trim()
  return {
    name: draft.name.trim(),
    dosage: dosage === '' ? null : dosage,
    started_on: draft.start === '' ? null : draft.start,
    ended_on: draft.ongoing || draft.end === '' ? null : draft.end,
    ongoing: draft.ongoing,
  }
}

/** The new courses of one save, checked as the server will. */
export function readNewCourses(drafts: readonly CourseDraft[]): CourseRead<MedicationsInput> {
  if (drafts.length === 0) return { ok: false, problems: { items: 'none' } }
  if (drafts.length > MEDICATION_LIMITS.items) return { ok: false, problems: { items: 'tooMany' } }

  const course: Record<string, CourseProblems> = {}
  for (const draft of drafts) {
    const found = problemsOf(draft, false)
    if (hasProblems(found)) course[draft.key] = found
  }
  if (Object.keys(course).length > 0) return { ok: false, problems: { course } }

  const parsed = MedicationsInputSchema.safeParse({ items: drafts.map(courseValue) })
  if (!parsed.success) return { ok: false, rejected: true, problems: {} }
  return { ok: true, value: parsed.data }
}

/**
 * A correction of a current course: only what changed, or `null` when
 * nothing did. A course from the pet form with no known start may keep it
 * unknown.
 */
export function readCourseChange(course: Medication, draft: CourseDraft): CourseRead<MedicationPatch | null> {
  const found = problemsOf(draft, course.started_on === null)
  if (hasProblems(found)) return { ok: false, problems: { course: { [draft.key]: found } } }

  const next = courseValue(draft)
  const patch: MedicationPatch = {}
  if (next.name !== course.name.trim()) patch.name = next.name
  if ((next.dosage ?? null) !== course.dosage) patch.dosage = next.dosage
  if ((next.started_on ?? null) !== course.started_on) patch.started_on = next.started_on
  if ((next.ended_on ?? null) !== course.ended_on) patch.ended_on = next.ended_on
  if (next.ongoing !== course.ongoing) patch.ongoing = next.ongoing
  if (Object.keys(patch).length === 0) return { ok: true, value: null }

  const parsed = MedicationPatchSchema.safeParse(patch)
  if (!parsed.success) return { ok: false, rejected: true, problems: {} }
  return { ok: true, value: parsed.data }
}

/** Whether leaving the form loses anything. */
export function coursesChanged(initial: readonly CourseDraft[], drafts: readonly CourseDraft[]): boolean {
  const read = (list: readonly CourseDraft[]) =>
    JSON.stringify(list.map((draft) => ({ ...courseValue(draft), end: draft.end, key: undefined })))
  return read(initial) !== read(drafts)
}

/**
 * Whether the course as typed ends today or earlier: saved like that it is
 * finished, and from then on only read — the form says so before saving.
 */
export function endsByToday(draft: CourseDraft, today: string): boolean {
  return !draft.ongoing && draft.end !== '' && draft.end <= today
}
