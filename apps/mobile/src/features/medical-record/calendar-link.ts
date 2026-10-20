import type { Dictionary } from '@/i18n'

/**
 * A planned visit or due date as a Google Calendar event (FB-3/01).
 *
 * A template link rather than the phone's calendar: no native module and no
 * permission, so it ships as an update (owner's decision of 20 October 2026).
 * It opens the Google Calendar app or the site with the event filled in; the
 * owner saves it there. The event takes the whole day — the record has a day,
 * not a time.
 */
export function calendarLink(event: { title: string; date: string; details?: string | null; location?: string | null }): string {
  const params: Array<[string, string]> = [
    ['action', 'TEMPLATE'],
    ['text', event.title],
    ['dates', `${compact(event.date)}/${compact(nextDay(event.date))}`],
  ]
  if (event.details) params.push(['details', event.details])
  if (event.location) params.push(['location', event.location])
  // By hand, not URLSearchParams: React Native's is not complete on every version.
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
  return `https://calendar.google.com/calendar/render?${query}`
}

/** «Мурка: визит к врачу». */
export function calendarTitle(t: Dictionary, petName: string, what: string): string {
  return t.calendarEvent.title(petName, what)
}

function compact(day: string): string {
  return day.replaceAll('-', '')
}

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)
}
