/**
 * A planned record as a Google Calendar event (FB-3/01): a template link,
 * not the calendar itself — no OAuth, no permission, nothing saved for the
 * owner. It opens Google Calendar with the event filled in, and the owner
 * saves it there or not. The event takes the whole day: the record has a
 * day, not a time. Only what the caller passes goes in — the event's own
 * title, details and place, never the rest of the medical record. Words
 * are the caller's, in its own language.
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

function compact(day: string): string {
  return day.replaceAll('-', '')
}

/** The next calendar day, counted in UTC so no zone shifts it. */
function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)
}
