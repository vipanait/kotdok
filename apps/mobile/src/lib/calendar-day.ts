/**
 * Calendar days — `YYYY-MM-DD` with no time and no zone — for the medical
 * record: when a cat was weighed or vaccinated, not the moment. Kept out of
 * `Date` arithmetic in local time, where a day can quietly become the one
 * before it.
 */

const pad = (value: number) => String(value).padStart(2, '0')

/** Today on the owner's calendar. A weighing at 01:00 in Moscow is not yesterday's. */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `2026-09-24` → «24.09.2026», the way the field shows it. */
export function dayInput(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

/**
 * «24.09.2026» (or with / or -) → `2026-09-24`; null for a day that does not
 * exist or is still ahead.
 */
export function parseDayInput(text: string, now: Date = new Date()): string | null {
  const match = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text)
  if (!match) return null

  const [, date, month, year] = match.map(Number)
  const probe = new Date(Date.UTC(year, month - 1, date))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) {
    return null
  }

  const day = `${year}-${pad(month)}-${pad(date)}`
  return day > localToday(now) ? null : day
}

/** A calendar day moved by whole months, staying a calendar day. */
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const moved = new Date(Date.UTC(year, month - 1 + months, date))
  return moved.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function monthsBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
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
