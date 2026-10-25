'use client'

import { useMemo, useSyncExternalStore } from 'react'

const MINUTE_MS = 60_000

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, MINUTE_MS)
  return () => window.clearInterval(timer)
}

/** The current minute: the same value for every read within it, as the store contract wants. */
const minuteNow = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS
const onServer = () => null

/**
 * «Now» on the browser's clock, to the minute, once the page is in the
 * browser; `null` on the server and while hydrating. A question's time is
 * moved out of the night on the owner's own clock (`followupFireMoment`),
 * which the server does not have — so it is written only here, and both
 * renders agree until then.
 */
export function useBrowserClock(): Date | null {
  const minute = useSyncExternalStore(subscribe, minuteNow, onServer)
  return useMemo(() => (minute === null ? null : new Date(minute)), [minute])
}
