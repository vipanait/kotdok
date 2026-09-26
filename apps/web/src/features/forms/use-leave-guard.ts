'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Unsaved changes in a form page: the browser asks on reload or closing the
 * tab; a link anywhere on the page (the back link, «Отмена», the cabinet
 * navigation) is held and `leaveHref` set, so the page can ask in its own
 * dialog first. Captured on window, before next/link acts.
 *
 * `leave(href)` is the way out once the form is done — saved, deleted or
 * abandoned on purpose: it stops asking and navigates, refreshing server
 * data the save may have changed.
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

  useEffect(() => {
    if (!dirty) return

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

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('click', onClick, true)
    }
  }, [dirty])

  const leave = useCallback(
    (href: string) => {
      leavingRef.current = true
      router.push(href)
      router.refresh()
    },
    [router],
  )

  const stay = useCallback(() => setLeaveHref(null), [])

  return { leaveHref, leaveLinkRef, stay, leave }
}
