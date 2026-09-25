import 'server-only'
import { cookies } from 'next/headers'
import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE, isValidTimeZone } from '@/shared/i18n/time-zone'

/** The visitor's time zone for printing check times, never the server's. */
export async function getTimeZone(): Promise<string> {
  const value = (await cookies()).get(TIME_ZONE_COOKIE)?.value
  return isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE
}
