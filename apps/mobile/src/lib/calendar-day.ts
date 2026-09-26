/**
 * Calendar days — `YYYY-MM-DD` with no time and no zone — for the medical
 * record: when a cat was weighed or vaccinated, not the moment. Kept out of
 * `Date` arithmetic in local time, where a day can quietly become the one
 * before it.
 */

import { localToday } from '@lapka/shared'

/**
 * The calendar arithmetic is shared with the web app (packages/shared,
 * medical-record/record-overview.ts): one rule for "today", months and days.
 * What stays here is how the phone's date field reads and writes a day.
 */
export { addMonths, daysBetween, localToday, monthsBetween } from '@lapka/shared'

const pad = (value: number) => String(value).padStart(2, '0')

/** `2026-09-24` → «24.09.2026», the way the field shows it. */
export function dayInput(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

/** «24.09.2026» (or with / or -) → `2026-09-24`; null for a day that does not exist. */
export function parseDayText(text: string): string | null {
  const match = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text)
  if (!match) return null

  const [, date, month, year] = match.map(Number)
  const probe = new Date(Date.UTC(year, month - 1, date))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) {
    return null
  }
  return `${year}-${pad(month)}-${pad(date)}`
}

/** A day that has come: «24.09.2026» → `2026-09-24`, null if it is still ahead or not a day. */
export function parseDayInput(text: string, now: Date = new Date()): string | null {
  const day = parseDayText(text)
  return day !== null && day <= localToday(now) ? day : null
}

/** A day still to come or today, for a plan: null if it has passed or is not a day. */
export function parseFutureDayInput(text: string, now: Date = new Date()): string | null {
  const day = parseDayText(text)
  return day !== null && day >= localToday(now) ? day : null
}

/**
 * The parts of a calendar day, for a dictionary to put in its own order with
 * its own month names. Not `toLocaleDateString`: Hermes and Node disagree on
 * short months («сент» against «сен») and on the Russian «г.», and a date
 * should read the same in a test as on a phone.
 */
export function dayParts(day: string): { year: number; month: number; date: number } {
  const [year, month, date] = day.split('-').map(Number)
  return { year, month, date }
}
