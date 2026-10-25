/**
 * Normalises a database timestamp to UTC ISO 8601 with an offset, which is what
 * every date crossing the API must look like.
 *
 * Several columns are `timestamp without time zone` and come back as
 * `2026-05-01T10:00:00` — no zone at all. They were written by `now()` on a UTC
 * server, so the missing zone is UTC; saying so explicitly keeps a client from
 * reading them in its own local time.
 */
export function toUtcIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString()

  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasZone ? value : `${value}Z`).toISOString()
}

/** The Intl tag of a language of the apps; anything else is passed through. */
const intlTag = (locale: string) => (locale === 'ru' ? 'ru-RU' : locale === 'en' ? 'en-US' : locale)

/**
 * A moment as the owner reads it: «23 сентября 2026, 12:40» /
 * «September 23, 2026, 12:40 PM». Built from parts because the plain Russian
 * format adds «г.» and «в»; `year: false` leaves the year out where a list
 * already sits under a month heading. The check result, the check history
 * and the phone's history all used to write this each in its own way.
 */
export function formatDateTime(
  iso: string,
  locale: string,
  options: { timeZone?: string; year?: boolean } = {},
): string {
  const withYear = options.year !== false
  const parts = new Intl.DateTimeFormat(intlTag(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options.timeZone,
  }).formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const time = `${get('hour')}:${get('minute')}`
  const year = withYear ? ` ${get('year')}` : ''
  if (locale === 'ru') return `${get('day')} ${get('month')}${year}, ${time}`
  const period = get('dayPeriod')
  return `${get('month')} ${get('day')},${withYear ? `${year},` : ''} ${time}${period ? ` ${period}` : ''}`
}
