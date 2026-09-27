'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBackGuard, type BackGuard } from './back-guard'

/** `leaveHref` when the owner pressed the browser's Back: «Уйти» goes back, not to an address. */
export const LEAVE_BACK = 'lapka:back'

/**
 * Unsaved changes in a form page: the browser asks on reload or closing the
 * tab; a link anywhere on the page (the back link, «Отмена», the cabinet
 * navigation) is held and `leaveHref` set, so the page can ask in its own
 * dialog first. Captured on window, before next/link acts. The browser's
 * Back is held too (MW-09, `back-guard.ts`): the page stays and `leaveHref`
 * is `LEAVE_BACK`.
 *
 * `leave(href)` is the way out once the form is done — saved, deleted or
 * abandoned on purpose: it stops asking and navigates, refreshing server
 * data the save may have changed. `leave(LEAVE_BACK)` goes back.
 */
export function useLeaveGuard(dirty: boolean): {
  leaveHref: string | null
  /** The link that was held, for focus to return to when the owner stays. */
  leaveLinkRef: React.RefObject<HTMLElement | null>
  stay: () => void
  leave: (href: string) => void
} {
  const router = useRouter()
  const [leaveHref, setLeaveHref] = useState<string | null>(null)
  const leaveLinkRef = useRef<HTMLElement | null>(null)
  /** Set once the form is done — saved, deleted or abandoned on purpose. */
  const leavingRef = useRef(false)
  const guardRef = useRef<BackGuard | null>(null)

  function guard(): BackGuard {
    guardRef.current ??= createBackGuard({
      get state() {
        return window.history.state
      },
      pushState: (data, unused) => window.history.pushState(data, unused),
      back: () => window.history.back(),
      go: (delta) => window.history.go(delta),
      href: () => window.location.href,
    })
    return guardRef.current
  }

  useEffect(() => {
    if (!dirty) {
      // Clean again (or saving): Back is no longer held.
      guardRef.current?.disarm()
      return
    }

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (leavingRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    function onClick(e: MouseEvent) {
      if (leavingRef.current || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      e.preventDefault()
      leaveLinkRef.current = anchor
      setLeaveHref(url.pathname + url.search + url.hash)
    }

    guard().arm()
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('click', onClick, true)
    }
  }, [dirty])

  useEffect(() => {
    let rearm: number | undefined
    function onPopState() {
      if (leavingRef.current || !guardRef.current) return
      const seen = guardRef.current.popped()
      if (seen === 'skip') {
        // The copy of a form that is clean again: the owner pressed Back once.
        window.history.back()
        return
      }
      if (seen !== 'ask') return
      // Back onto the form's own entry: the page stays. The copy goes back on
      // top once Next has settled this entry, and the form asks.
      rearm = window.setTimeout(() => {
        if (!leavingRef.current) guardRef.current?.arm()
      }, 0)
      leaveLinkRef.current = null
      setLeaveHref(LEAVE_BACK)
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.clearTimeout(rearm)
      window.removeEventListener('popstate', onPopState)
      // A form taken away while its copy is in history (re-keyed with new
      // data, say) takes the copy back — unless the page has moved on.
      const current = guardRef.current
      if (!current?.armed || leavingRef.current) return
      const here = window.location.href
      window.setTimeout(() => {
        if (window.location.href === here) current.drop()
      }, 0)
    }
  }, [])

  const leave = useCallback(
    (href: string) => {
      leavingRef.current = true
      if (href === LEAVE_BACK) {
        guard().goBack()
        return
      }
      // The copy on top is replaced by the next page, not left behind for Back to find.
      if (guard().leave() === 'replace') router.replace(href)
      else router.push(href)
      router.refresh()
    },
    [router],
  )

  const stay = useCallback(() => setLeaveHref(null), [])

  return { leaveHref, leaveLinkRef, stay, leave }
}
