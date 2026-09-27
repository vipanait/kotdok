'use client'

import { useEffect, useRef, useState } from 'react'
import { localToday } from '@lapka/shared'
import { dayAfterLook, nextDayCheckDelay } from './today'

/**
 * The owner's today on a page or a form, moving on at midnight (MW-09):
 * a timer set just past midnight, and another look whenever the tab comes
 * back into view or the window gets focus (a sleeping laptop's timers do not
 * fire on time). Nothing typed in a form is touched — a form reads `today`
 * for its date limits, which follow the new day.
 *
 * `initial`: the day the server drew the page with (the owner's zone,
 * `getOwnerToday`), so the first render is the same on both sides; without
 * it, the browser's own day.
 */
export function useToday(initial?: string): string {
  const [today, setToday] = useState(() => initial ?? localToday())
  const shownRef = useRef(today)

  useEffect(() => {
    let seen = localToday()
    let timer: number | undefined

    function look() {
      const next = dayAfterLook(shownRef.current, seen)
      seen = next.seen
      if (next.shown !== shownRef.current) {
        shownRef.current = next.shown
        setToday(next.shown)
      }
      schedule()
    }
    function schedule() {
      window.clearTimeout(timer)
      timer = window.setTimeout(look, nextDayCheckDelay(new Date()))
    }
    function onVisible() {
      if (document.visibilityState === 'visible') look()
    }

    schedule()
    window.addEventListener('focus', look)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', look)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}
