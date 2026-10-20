import { addMonths, daysBetween, monthsBetween } from '../medical-record/record-overview'

/**
 * A pet's dates (FB-2): its age, the day an estimated age stands for, the
 * days together and the birthday. One set of rules for the app, the site and
 * the analysis, on calendar days of the owner's own calendar.
 */

/**
 * Age in years with one decimal: from the birth date when there is one — it
 * grows on its own — otherwise the age as typed.
 */
export function petAgeYears(pet: { birth_date: string | null; age_years: number | null }, today: string): number | null {
  if (!pet.birth_date) return pet.age_years
  return Math.round((monthsBetween(pet.birth_date, today) / 12) * 10) / 10
}

/** «About 4 years 6 months» as a day: that long before `today`. */
export function approxBirthDate(years: number, months: number, today: string): string {
  return addMonths(today, -(years * 12 + months))
}

/** Days together, the first day counting as one; null without the day. */
export function daysTogether(adoptedOn: string | null, today: string): number | null {
  return adoptedOn ? daysBetween(adoptedOn, today) + 1 : null
}

/** A day worth a word: every hundred days and every full year together. */
export function togetherMilestone(days: number): boolean {
  return days % 100 === 0 || days % 365 === 0
}

/**
 * Whether today is the birthday. Never on an estimated date — congratulating
 * on a made-up day is worse than saying nothing — nor on the day of birth.
 * Born on 29 February: 28 February in a year without one.
 */
export function isBirthday(birthDate: string | null, approx: boolean, today: string): boolean {
  if (!birthDate || approx || birthDate >= today) return false
  const birth = birthDate.slice(5)
  const now = today.slice(5)
  if (birth === now) return true
  const year = Number(today.slice(0, 4))
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return birth === '02-29' && now === '02-28' && !leap
}
