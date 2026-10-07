import { MEDICATION_LIMITS, type Medication, type MedicationPatch, type MedicationsInput } from '@lapka/contracts'
import { ApiError, courseDayProblems, endCoursePatch, endsByToday } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { dayInput, dayParts, localToday, parseDayText } from '@/lib/calendar-day'

/**
 * Medication courses for the screens: how their dates read, and the course
 * form. Which courses are current, and their order, is shared with the site
 * (`isCurrentCourse`, `splitCourses` in @lapka/shared). No schedules and no
 * reminders — a course is written down so it is not forgotten, the dose is
 * the vet's (spec §7.12).
 */

/**
 * «2–15 августа», «28 июля – 15 августа», «с 2 августа · постоянно». The
 * year appears when the course is not all in this year.
 */
export function courseDates(t: Dictionary, course: Medication, today: string): string {
  const words = t.medicalRecord.meds
  if (!course.started_on && !course.ended_on) {
    if (course.ongoing) return words.ongoingOnly
    return course.source === 'form' && !course.dosage ? words.fromForm : words.noDates
  }
  const year = today.slice(0, 4)
  if (course.started_on && !course.ended_on) {
    const from = t.day(course.started_on, course.started_on.slice(0, 4) !== year)
    return course.ongoing ? words.sinceOngoing(from) : words.since(from)
  }
  if (!course.started_on && course.ended_on) return words.range('…', t.day(course.ended_on, course.ended_on.slice(0, 4) !== year))

  // A one-day course: its day, once.
  if (course.started_on === course.ended_on) return t.day(course.ended_on!, course.ended_on!.slice(0, 4) !== year)

  const start = dayParts(course.started_on!)
  const end = dayParts(course.ended_on!)
  const withYear = start.year !== end.year || String(end.year) !== year
  if (start.year === end.year && start.month === end.month && !withYear) {
    // «2–15 августа», «August 2–15»: the month once, where the language puts it.
    return words.rangeInMonth(
      { date: start.date, day: t.day(course.started_on!, false) },
      { date: end.date, day: t.day(course.ended_on!, false) },
    )
  }
  return words.range(t.day(course.started_on!, withYear), t.day(course.ended_on!, withYear))
}

export type CourseDraft = {
  key: string
  name: string
  dosage: string
  start: string
  end: string
  ongoing: boolean
}

export function blankCourse(key: string, now: Date = new Date()): CourseDraft {
  return { key, name: '', dosage: '', start: dayInput(localToday(now)), end: '', ongoing: false }
}

export function courseDraft(course: Medication): CourseDraft {
  return {
    key: course.id,
    name: course.name,
    dosage: course.dosage ?? '',
    start: course.started_on ? dayInput(course.started_on) : '',
    end: course.ended_on ? dayInput(course.ended_on) : '',
    ongoing: course.ongoing,
  }
}

export type CourseErrors = Record<string, { name?: string; dosage?: string; start?: string; end?: string }>

export type ReadCourses = { ok: true; value: MedicationsInput['items'] } | { ok: false; errors: CourseErrors }

/** «24.09.2026» as the shared rules read it: a day, '' for none, or the text as typed (not a day). */
const typedDay = (text: string) => (text.trim() === '' ? '' : (parseDayText(text) ?? text.trim()))

/**
 * Checked like the server and the site: texts within the contract's limits,
 * dates that exist, an end not before the start, and a start (spec §7.12) —
 * unless `startOptional`, a course from the pet form being corrected whose
 * start nobody knows (shared `startMayStayEmpty`). The day rules are the
 * site's (`courseDayProblems` in @lapka/shared).
 */
export function readCourses(t: Dictionary, drafts: readonly CourseDraft[], startOptional = false): ReadCourses {
  const words = t.medicalRecord.meds
  const tooLong = t.medicalRecord.tooLong
  const errors: CourseErrors = {}

  const value = drafts.map((draft) => {
    const problems: CourseErrors[string] = {}
    const name = draft.name.trim()
    if (name === '') problems.name = words.nameRequired
    else if (name.length > MEDICATION_LIMITS.name) problems.name = tooLong(MEDICATION_LIMITS.name)

    const start = typedDay(draft.start)
    const end = typedDay(draft.end)
    const days = courseDayProblems({ start, end, ongoing: draft.ongoing }, startOptional)
    if (days.start === 'empty') problems.start = words.startRequired
    else if (days.start) problems.start = words.dateInvalid
    if (days.end === 'invalid') problems.end = words.dateInvalid
    else if (days.end === 'beforeStart') problems.end = words.endBeforeStart

    const dosage = draft.dosage.trim()
    if (dosage.length > MEDICATION_LIMITS.dosage) problems.dosage = tooLong(MEDICATION_LIMITS.dosage)
    if (Object.keys(problems).length > 0) errors[draft.key] = problems
    return {
      name,
      dosage: dosage === '' ? null : dosage,
      started_on: start === '' ? null : start,
      ended_on: draft.ongoing || end === '' ? null : end,
      ongoing: draft.ongoing,
    }
  })

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value }
}

/**
 * Whether the course as typed ends today or earlier: saved like that it is
 * finished and only read from then on, so the form says so before saving —
 * the site's rule (shared `endsByToday`). An end that is not a day yet says
 * nothing; its error comes on saving.
 */
export function courseEndsByToday(draft: CourseDraft, today: string = localToday()): boolean {
  const end = draft.end.trim() === '' ? '' : parseDayText(draft.end)
  return end !== null && endsByToday({ end, ongoing: draft.ongoing }, today)
}

/** Whether «+ Ещё препарат» may add one more: one save takes the contract's number of courses. */
export function canAddCourse(drafts: readonly CourseDraft[]): boolean {
  return drafts.length < MEDICATION_LIMITS.items
}

/**
 * One «Завершить курс» on the course screen, however many times it is sent:
 * the day of its first try is kept (`attempt.day`) until the server answers,
 * so a retry after a lost answer — after midnight too — sends the same end
 * and the server, finding the course already so, answers with it (200)
 * rather than refusing a new end of a finished course (MW-09 final review).
 * `today` goes as the owner's day of the request all the same.
 *
 * `reread`: the server says the course is finished (`record_done`) — ended
 * on another device, or on this one on another day: the screen reads it
 * again and shows it as it is. Anything else is thrown for the screen to say.
 */
export async function endCourse(
  send: (patch: MedicationPatch, today: string) => Promise<Medication>,
  attempt: { day: string | null },
  today: string,
): Promise<{ kind: 'ended'; course: Medication } | { kind: 'reread' }> {
  const day = attempt.day ?? today
  attempt.day = day
  try {
    const course = await send(endCoursePatch(day), today)
    attempt.day = null
    return { kind: 'ended', course }
  } catch (cause) {
    // The server answered: nothing of this try is in doubt any more.
    if (cause instanceof ApiError) attempt.day = null
    if (cause instanceof ApiError && cause.code === 'record_done') return { kind: 'reread' }
    throw cause
  }
}
