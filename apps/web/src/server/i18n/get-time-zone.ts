import 'server-only'
import { cookies } from 'next/headers'
import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE, dayInZone, isValidTimeZone } from '@/shared/i18n/time-zone'

/** The visitor's time zone for printing check times, never the server's. */
export async function getTimeZone(): Promise<string> {
  const value = (await cookies()).get(TIME_ZONE_COOKIE)?.value
  return isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE
}

/**
 * The owner's today on a page the server draws: the day in the visitor's
 * zone, not the server's UTC one — a form's date limits drawn with the UTC
 * day stay yesterday's after hydration in Moscow between 00:00 and 03:00.
 */
export async function getOwnerToday(now: Date = new Date()): Promise<string> {
  return dayInZone(now, await getTimeZone())
}
