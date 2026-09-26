import { CalendarDateSchema, type Medication, type MedicationPatch } from '@lapka/contracts'
import { isCurrentCourse } from './record-overview'

/**
 * The rules of a medication course that the web and the phone share: which
 * course can still be changed, when «Завершить курс» is offered and what it
 * sends, and what is wrong with a course's dates as typed. No UI and no text:
 * each app says it in its own words. Which courses are current, and in what
 * order, is `isCurrentCourse` / `splitCourses` (record-overview.ts).
 */

/**
 * Whether a course's details can still be changed: only while it goes on.
 * A finished course is history — read, and deleted if it is wrong, never
 * corrected (owner rule of 26 September 2026). `today` is the owner's day.
 */
export function courseEditable(course: Pick<Medication, 'ended_on'>, today: string): boolean {
  return isCurrentCourse(course, today)
}

/**
 * Whether «Завершить курс» is offered: the course goes on and has begun. One
 * that starts later is corrected or deleted, not ended — its end would come
 * before its start.
 */
export function canEndCourse(course: Pick<Medication, 'started_on' | 'ended_on'>, today: string): boolean {
  return isCurrentCourse(course, today) && (course.started_on === null || course.started_on <= today)
}

/**
 * What «Завершить курс» sends: the owner's today is the last day, so the
 * course leaves «Принимает сейчас» at once and stays in the history.
 */
export function endCoursePatch(today: string): MedicationPatch {
  return { ended_on: today, ongoing: false }
}

export type CourseDayProblems = {
  start?: 'empty' | 'invalid'
  end?: 'invalid' | 'beforeStart'
}

/**
 * What is wrong with a course's dates as typed: `start` and `end` are
 * `YYYY-MM-DD`, '' when none was given, or anything else typed (the
 * contract's own schema decides what a real day is).
 *
 * - The start is needed unless `startOptional` — a course brought over from
 *   the pet form whose start nobody knows keeps it unknown.
 * - «Постоянно» has no end: whatever the end field holds is not read.
 * - The end is optional, and never before the start (the same day is a
 *   one-day course).
 */
export function courseDayProblems(
  course: { start: string; end: string; ongoing: boolean },
  startOptional = false,
): CourseDayProblems {
  const problems: CourseDayProblems = {}
  const startValid = course.start !== '' && CalendarDateSchema.safeParse(course.start).success
  if (course.start === '') {
    if (!startOptional) problems.start = 'empty'
  } else if (!startValid) {
    problems.start = 'invalid'
  }

  if (!course.ongoing && course.end !== '') {
    if (!CalendarDateSchema.safeParse(course.end).success) problems.end = 'invalid'
    else if (startValid && course.end < course.start) problems.end = 'beforeStart'
  }
  return problems
}
