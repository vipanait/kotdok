'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CopyMemo } from './back-guard'
import { LEAVE_BACK, createLeaveGuard, type LeaveGuard } from './leave-guard'

export { LEAVE_BACK }

/**
 * Where focus goes back after «Остаться» on the question Back raised: the
 * element the owner was on, or — when that is nothing (the page body) — the
 * form's first field, so focus never falls to the start of the page.
 */
function focusAfterBack(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null
  if (active && active !== document.body && active.isConnected) return active
  return document.querySelector<HTMLElement>(
    'main form input:not([type=hidden]):not([disabled]), main form textarea:not([disabled]), main form select:not([disabled]), main form button:not([disabled])',
  )
}

const COPY_MEMO_KEY = 'lapka-leave-guard-copy'

/** Module state lives as long as the document: a reload starts it over. */
let documentMountClaimed = false

/** True for the first form guard mounted in this document, false for every later one (MW-09 fix round 2). */
function documentFirstMount(): boolean {
  if (documentMountClaimed) return false
  documentMountClaimed = true
  return true
}

/** The key of the current history entry, where the browser has the Navigation API; it survives a reload. */
function entryKey(): string | null {
  const navigation = (window as { navigation?: { currentEntry?: { key?: string } | null } }).navigation
  return navigation?.currentEntry?.key ?? null
}

/**
 * Which entry is the guard's copy, kept for this tab in sessionStorage (only
 * an address, an entry key and a count — nothing the owner typed). With the
 * Navigation API the entry key decides; without it, the address and the
 * history's length, which a reload on the copy keeps.
 */
const copyMemo: CopyMemo = {
  remember() {
    try {
      sessionStorage.setItem(COPY_MEMO_KEY, JSON.stringify({ href: window.location.href, entry: entryKey(), length: window.history.length }))
    } catch {
      // No storage (a private window): a reload on the copy is then not recognised.
    }
  },
  isCopy() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(COPY_MEMO_KEY) ?? 'null') as { href: string; entry: string | null; length: number } | null
      if (!saved || saved.href !== window.location.href) return false
      const entry = entryKey()
      if (entry && saved.entry) return entry === saved.entry
      return saved.length === window.history.length
    } catch {
      return false
    }
  },
  forget() {
    try {
      sessionStorage.removeItem(COPY_MEMO_KEY)
    } catch {
      // Nothing to forget.
    }
  },
}

/**
 * Unsaved changes in a form page: the browser asks on reload or closing the
 * tab; a link anywhere on the page (the back link, «Отмена», the cabinet
 * navigation) is held and `leaveHref` set, so the page can ask in its own
 * dialog first. Captured on window, before next/link acts. The browser's
 * Back is held too (MW-09, `back-guard.ts`): the page stays and `leaveHref`
 * is `LEAVE_BACK`. What is decided — and the history left behind — is
 * `leave-guard.ts`; this hook feeds it the page's events.
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
  const guardRef = useRef<LeaveGuard | null>(null)
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  }, [router])

  const guard = useCallback((): LeaveGuard => {
    guardRef.current ??= createLeaveGuard(
      {
        get state() {
          return window.history.state
        },
        pushState: (data, unused) => window.history.pushState(data, unused),
        back: () => window.history.back(),
        go: (delta) => window.history.go(delta),
        href: () => window.location.href,
      },
      {
        push: (href) => routerRef.current.push(href),
        replace: (href) => routerRef.current.replace(href),
        refresh: () => routerRef.current.refresh(),
      },
      (run) => void window.setTimeout(run, 0),
      copyMemo,
      documentFirstMount,
    )
    return guardRef.current
  }, [])

  useEffect(() => {
    guard().setDirty(dirty)
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (guard().leaving) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, guard])

  // For the form's whole life: links, Back, and the copy a reload left on top.
  useEffect(() => {
    const current = guard()
    current.mounted()

    function onClick(e: MouseEvent) {
      if (current.leaving || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      const href = url.pathname + url.search + url.hash

      const seen = current.linkClicked(href)
      if (seen === 'pass') return
      e.preventDefault()
      if (seen === 'hold') {
        leaveLinkRef.current = anchor
        setLeaveHref(href)
      }
    }

    function onPopState() {
      if (current.popped() !== 'ask') return
      // «Остаться» returns focus to where the owner was, or to the form's first field.
      leaveLinkRef.current = focusAfterBack()
      setLeaveHref(LEAVE_BACK)
    }

    window.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
      current.unmounted()
    }
  }, [guard])

  const leave = useCallback((href: string) => guard().leave(href), [guard])
  const stay = useCallback(() => setLeaveHref(null), [])

  return { leaveHref, leaveLinkRef, stay, leave }
}
