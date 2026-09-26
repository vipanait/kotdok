import { MEDICATION_LIMITS, type Medication, type MedicationsInput } from '@lapka/contracts'
import { courseDayProblems } from '@lapka/shared'
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
    // «2–15 августа»: the month once.
    return `${start.date}–${t.day(course.ended_on!, false)}`
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

/**
 * Checked like the server: a name up to 150 characters, dates that exist, an
 * end not before the start. The day rules are the site's too
 * (`courseDayProblems` in @lapka/shared); the phone lets the start be left
 * empty, as it always has (MR-06).
 */
export function readCourses(t: Dictionary, drafts: readonly CourseDraft[]): ReadCourses {
  const words = t.medicalRecord.meds
  const errors: CourseErrors = {}

  const value = drafts.map((draft) => {
    const problems: CourseErrors[string] = {}
    const name = draft.name.trim()
    if (name === '') problems.name = words.nameRequired
    else if (name.length > MEDICATION_LIMITS.name) problems.name = words.tooLong

    // «24.09.2026» as the shared rule reads it: a day, '' for none, or the text as typed (not a day).
    const typed = (text: string) => (text.trim() === '' ? '' : (parseDayText(text) ?? text.trim()))
    const start = typed(draft.start)
    const end = typed(draft.end)
    const days = courseDayProblems({ start, end, ongoing: draft.ongoing }, true)
    if (days.start) problems.start = words.dateInvalid
    if (days.end === 'invalid') problems.end = words.dateInvalid
    else if (days.end === 'beforeStart') problems.end = words.endBeforeStart

    const dosage = draft.dosage.trim()
    if (dosage.length > MEDICATION_LIMITS.dosage) problems.dosage = words.tooLong
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
