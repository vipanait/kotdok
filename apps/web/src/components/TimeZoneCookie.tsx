'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TIME_ZONE_COOKIE, isValidTimeZone } from '@/shared/i18n/time-zone'

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find(part => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Tells the server the browser's time zone, so check times read as the owner's
 * clock. Re-renders once when the zone is first learnt or has changed.
 */
export default function TimeZoneCookie() {
  const router = useRouter()

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!isValidTimeZone(zone)) return
    const stored = readCookie(TIME_ZONE_COOKIE)
    if (stored && decodeURIComponent(stored) === zone) return
    writeCookie(TIME_ZONE_COOKIE, zone)
    router.refresh()
  }, [router])

  return null
}
