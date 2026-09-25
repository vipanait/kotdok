/** Cookie holding the visitor's IANA time zone, written by the browser. */
export const TIME_ZONE_COOKIE = 'lapka-tz'

/**
 * Times are printed on the server, which runs in UTC. Until the browser has
 * told us its zone, Moscow time is the closest guess for this audience.
 */
export const DEFAULT_TIME_ZONE = 'Europe/Moscow'

export function isValidTimeZone(value: string | undefined | null): value is string {
  if (!value || value.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}
