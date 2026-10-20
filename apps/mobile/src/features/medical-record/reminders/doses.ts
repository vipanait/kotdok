import type { Medication, MedicationDose } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { localToday } from '@/lib/calendar-day'
import { REMINDER_LIMIT, type PlannedReminder } from './schedule'

/**
 * Doses of medicine at the times the owner set (FB-5): a reminder for each,
 * a week ahead, while the course runs on that day and the dose is not given
 * yet. One-off triggers rather than a daily repeat, so a dose marked «дали»
 * is taken off and a finished course stops — each sync rebuilds the week.
 */

export type DoseCourse = { pet: { id: string; name: string }; course: Medication }

export type DoseMoment = { petId: string; petName: string; course: Medication; day: string; slot: string; at: Date }

const DAYS_AHEAD = 7

export const DOSE_ID_PREFIX = 'lapka-dose-'
const RENEWAL_ID = 'lapka-dose-renew'

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

/** On the phone's wall clock: «08:00» is eight in the morning wherever the phone is. */
function wallClock(day: string, slot: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = slot.split(':').map(Number)
  return new Date(year, month - 1, date, hour, minute, 0, 0)
}

/**
 * A dose is given on every day from the start to the last day, both
 * included: «до 25 октября» means the 25th too. (`isTakenNow` counts a course
 * ending today as finished — right for «Принимает сейчас», not for the doses
 * of that day.) «Завершить курс» takes the times off, so it stops these.
 */
export function givenOn(course: Pick<Medication, 'started_on' | 'ended_on'>, day: string): boolean {
  return (course.started_on === null || course.started_on <= day) && (course.ended_on === null || course.ended_on >= day)
}

const given = (doses: readonly MedicationDose[]) => new Set(doses.map((dose) => `${dose.medication_id}|${dose.taken_on}|${dose.slot}`))

export function doseMoments(courses: readonly DoseCourse[], doses: readonly MedicationDose[], now: Date, days = DAYS_AHEAD): DoseMoment[] {
  const done = given(doses)
  const today = localToday(now)
  const moments: DoseMoment[] = []
  for (let offset = 0; offset < days; offset++) {
    const day = addDays(today, offset)
    for (const { pet, course } of courses) {
      if (!givenOn(course, day)) continue
      for (const slot of course.reminder_times) {
        const at = wallClock(day, slot)
        if (at <= now || done.has(`${course.id}|${day}|${slot}`)) continue
        moments.push({ petId: pet.id, petName: pet.name, course, day, slot, at })
      }
    }
  }
  return moments.sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** The doses as notifications, nearest first, within the phone's limit; due dates take what is left. */
export function planDoseReminders(t: Dictionary, courses: readonly DoseCourse[], doses: readonly MedicationDose[], now: Date): PlannedReminder[] {
  return doseMoments(courses, doses, now)
    .slice(0, REMINDER_LIMIT)
    .map((moment) => {
      const [hour, minute] = moment.slot.split(':').map(Number)
      const what = moment.course.dosage ? `${moment.course.name}, ${moment.course.dosage}` : moment.course.name
      return {
        id: `${DOSE_ID_PREFIX}${moment.course.id}-${moment.day}-${moment.slot}`,
        petId: moment.petId,
        day: moment.day,
        hour,
        minute,
        title: t.reminders.notificationTitle,
        body: t.doseReminders.body(moment.petName, what),
      }
    })
}

/**
 * The phone holds a week of doses, rebuilt whenever the app is opened. One
 * more notification, a minute after the last dose it holds, says so while
 * the course goes on past it — otherwise the reminders would simply stop for
 * someone who did not open the app for a week (PR #82 review).
 */
export function planDoseRenewal(
  t: Dictionary,
  courses: readonly DoseCourse[],
  doses: readonly MedicationDose[],
  now: Date,
  planned: readonly PlannedReminder[],
): PlannedReminder | null {
  const last = [...planned].reverse().find((reminder) => reminder.id.startsWith(DOSE_ID_PREFIX))
  if (!last) return null
  const lastAt = wallClock(last.day, `${String(last.hour).padStart(2, '0')}:${String(last.minute ?? 0).padStart(2, '0')}`)
  // A day past the window, so a course that runs on after it is seen too.
  const continues = doseMoments(courses, doses, now, DAYS_AHEAD + 1).some((moment) => moment.at > lastAt)
  if (!continues) return null
  const at = new Date(lastAt.getTime() + 60_000)
  return {
    id: RENEWAL_ID,
    petId: last.petId,
    day: localToday(at),
    hour: at.getHours(),
    minute: at.getMinutes(),
    title: t.reminders.notificationTitle,
    body: t.doseReminders.renew,
  }
}

export type TodayDose = { course: Medication; slot: string; state: 'given' | 'due' | 'missed' }

/** The pet card's «Сегодня»: every time of every course running today, given or not. */
export function todayDoses(courses: readonly Medication[], doses: readonly MedicationDose[], now: Date): TodayDose[] {
  const day = localToday(now)
  const done = given(doses)
  return courses
    .filter((course) => course.reminder_times.length > 0 && givenOn(course, day))
    .flatMap((course) =>
      course.reminder_times.map((slot) => ({
        course,
        slot,
        state: done.has(`${course.id}|${day}|${slot}`) ? ('given' as const) : wallClock(day, slot) <= now ? ('missed' as const) : ('due' as const),
      })),
    )
    .sort((a, b) => a.slot.localeCompare(b.slot))
}
