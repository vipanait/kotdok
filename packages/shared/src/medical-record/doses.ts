import { MEDICATION_TIMES_MAX, type Medication, type MedicationDose } from '@lapka/contracts'

/**
 * Doses of a medicine at the times the owner set (FB-5): which of today's
 * are given, and the «Своё время» field. The phone's rules
 * (apps/mobile dose-times.ts, reminders/doses.ts) without its clock or
 * words, so the site counts the same day the same way. Days and times are
 * the owner's own wall clock: «08:00» is eight in the morning wherever they are.
 */

/**
 * A dose is given on every day from the start to the last day, both
 * included: «до 25 октября» means the 25th too. A course with no start —
 * brought over from the pet form — runs until its end.
 */
export function givenOn(course: Pick<Medication, 'started_on' | 'ended_on'>, day: string): boolean {
  return (course.started_on === null || course.started_on <= day) && (course.ended_on === null || course.ended_on >= day)
}

/** One dose: a course, a day, a time. */
export function doseKey(medicationId: string, day: string, slot: string): string {
  return `${medicationId}|${day}|${slot}`
}

export type TodayDose = {
  course: Medication
  slot: string
  /** «Дали» pressed; still to give; or its time has passed unmarked. */
  state: 'given' | 'due' | 'missed'
}

/**
 * The pet card's «Сегодня»: every time of every course running on `day`,
 * given or not, in time order. `time` is the owner's «ЧЧ:ММ» now.
 */
export function todayDoses(courses: readonly Medication[], doses: readonly MedicationDose[], day: string, time: string): TodayDose[] {
  const done = new Set(doses.map((dose) => doseKey(dose.medication_id, dose.taken_on, dose.slot)))
  return courses
    .filter((course) => course.reminder_times.length > 0 && givenOn(course, day))
    .flatMap((course) =>
      course.reminder_times.map((slot) => ({
        course,
        slot,
        state: done.has(doseKey(course.id, day, slot)) ? ('given' as const) : slot <= time ? ('missed' as const) : ('due' as const),
      })),
    )
    .sort((a, b) => a.slot.localeCompare(b.slot))
}

/** Between hours and minutes: the colon, and what a keyboard or a paste gives instead. */
const SEPARATOR = '[:.;,\\s-]'

/**
 * «7:30», «07.30», «7 30», «7;30», «0730» → «07:30»; null for what is not a
 * time of day. Without a separator it takes four digits only: «123» is
 * someone still typing «12:30», not 01:23.
 */
export function readTime(text: string): string | null {
  const match = new RegExp(`^\\s*(?:(\\d{1,2})${SEPARATOR}+(\\d{2})|(\\d{2})(\\d{2}))\\s*$`).exec(text)
  if (!match) return null
  const hour = Number(match[1] ?? match[3])
  const minute = Number(match[2] ?? match[4])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * What «Своё время» holds after an edit: a pasted time reads as «ЧЧ:ММ»; what
 * is typed stays as it is while it can still become a time — «+» reads it.
 * Anything that cannot become a time keeps the field as it was.
 */
export function editTime(previous: string, next: string): string {
  const pasted = next.length - previous.length > 1
  const whole = readTime(next)
  if (pasted && whole) return whole
  const text = next.replace(/\s+/g, ' ')
  if (text === '' || new RegExp(`^\\d{1,2}(?:${SEPARATOR}\\d{0,2})?$|^\\d{3,4}$`).test(text)) return text
  return previous
}

/** A time added in order, never twice, at most {@link MEDICATION_TIMES_MAX}. */
export function addTime(times: readonly string[], time: string): string[] {
  if (times.includes(time) || times.length >= MEDICATION_TIMES_MAX) return [...times]
  return [...times, time].sort()
}

export function removeTime(times: readonly string[], time: string): string[] {
  return times.filter((entry) => entry !== time)
}
