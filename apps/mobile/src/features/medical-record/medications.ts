import type { Medication, MedicationsInput } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { dayInput, dayParts, localToday, parseDayText } from '@/lib/calendar-day'

/**
 * Medication courses for the screens: which are current, how their dates
 * read, and the course form. No schedules and no reminders — a course is
 * written down so it is not forgotten, the dose is the vet's (spec §7.12).
 */

/** Current until the end: a course ended today is done (its last dose was today). */
export function isCurrent(course: Medication, today: string): boolean {
  return course.ended_on === null || course.ended_on > today
}

export function splitCourses(courses: readonly Medication[], today: string) {
  const byStart = [...courses].sort((a, b) => (b.started_on ?? '').localeCompare(a.started_on ?? ''))
  return {
    current: byStart.filter((course) => isCurrent(course, today)),
    past: byStart
      .filter((course) => !isCurrent(course, today))
      .sort((a, b) => (b.ended_on ?? '').localeCompare(a.ended_on ?? '')),
  }
}

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

/** Checked like the server: a name up to 150 characters, dates that exist, an end not before the start. */
export function readCourses(t: Dictionary, drafts: readonly CourseDraft[]): ReadCourses {
  const words = t.medicalRecord.meds
  const errors: CourseErrors = {}

  const value = drafts.map((draft) => {
    const problems: CourseErrors[string] = {}
    const name = draft.name.trim()
    if (name === '') problems.name = words.nameRequired
    else if (name.length > 150) problems.name = words.tooLong

    const start = draft.start.trim() === '' ? null : parseDayText(draft.start)
    if (draft.start.trim() !== '' && start === null) problems.start = words.dateInvalid

    const end = draft.ongoing || draft.end.trim() === '' ? null : parseDayText(draft.end)
    if (!draft.ongoing && draft.end.trim() !== '' && end === null) problems.end = words.dateInvalid
    else if (start && end && end < start) problems.end = words.endBeforeStart

    const dosage = draft.dosage.trim()
    if (dosage.length > 150) problems.dosage = words.tooLong
    if (Object.keys(problems).length > 0) errors[draft.key] = problems
    return { name, dosage: dosage === '' ? null : dosage, started_on: start, ended_on: end, ongoing: draft.ongoing }
  })

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value }
}
