import { MEDICATION_LIMITS, type Medication, type MedicationPatch, type MedicationsInput } from '@lapka/contracts'
import { ApiError, courseProblems, coursePeriodParts, courseValue, endCoursePatch, endsByToday } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { dayInput, dayParts, localToday, parseDayText } from '@/lib/calendar-day'

/**
 * Medication courses for the screens: how their dates read, and the course
 * form. Which courses are current, and their order, is shared with the site
 * (`isCurrentCourse`, `splitCourses` in @lapka/shared). The dose is the
 * vet's (spec §7.12); the times it is given at, and the reminders, are the
 * owner's own (FB-5, spec §7.8) — the app suggests neither.
 */

/**
 * «2–15 августа», «28 июля – 15 августа», «с 2 августа · постоянно». The
 * year appears when the course is not all in this year.
 */
export function courseDates(t: Dictionary, course: Medication, today: string): string {
  const words = t.medicalRecord.meds
  // What the dates say is the shared rule (`coursePeriodParts`), the site's too.
  const parts = coursePeriodParts(course, today)
  switch (parts.kind) {
    case 'range': {
      if (parts.sameMonth && !parts.from.withYear) {
        // «2–15 августа», «August 2–15»: the month once, where the language puts it.
        return words.rangeInMonth(
          { date: dayParts(parts.from.day).date, day: t.day(parts.from.day, false) },
          { date: dayParts(parts.to.day).date, day: t.day(parts.to.day, false) },
        )
      }
      return words.range(t.day(parts.from.day, parts.from.withYear), t.day(parts.to.day, parts.to.withYear))
    }
    case 'day':
      return t.day(parts.day.day, parts.day.withYear)
    case 'startsLater':
      return words.startsLater(t.day(parts.day.day, parts.day.withYear))
    case 'since':
      return (parts.ongoing ? words.sinceOngoing : words.since)(t.day(parts.day.day, parts.day.withYear))
    case 'until':
      return words.range('…', t.day(parts.day.day, parts.day.withYear))
    case 'ongoing':
      return words.ongoingOnly
    case 'fromForm':
      return words.fromForm
    case 'noDates':
      return words.noDates
  }
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
    // The problems and the body are the shared reader's (`courseProblems`, `courseValue`, the site's too).
    const fields = { ...draft, start: typedDay(draft.start), end: typedDay(draft.end) }
    const found = courseProblems(fields, startOptional)
    const problems: CourseErrors[string] = {}
    if (found.name === 'empty') problems.name = words.nameRequired
    else if (found.name === 'tooLong') problems.name = tooLong(MEDICATION_LIMITS.name)
    if (found.start === 'empty') problems.start = words.startRequired
    else if (found.start) problems.start = words.dateInvalid
    if (found.end === 'invalid') problems.end = words.dateInvalid
    else if (found.end === 'beforeStart') problems.end = words.endBeforeStart
    if (found.dosage) problems.dosage = tooLong(MEDICATION_LIMITS.dosage)
    if (Object.keys(problems).length > 0) errors[draft.key] = problems
    return courseValue(fields)
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
