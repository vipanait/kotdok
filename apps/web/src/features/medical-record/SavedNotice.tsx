'use client'

import { useEffect, useRef } from 'react'

/**
 * The confirmation after a save or a delete, once: it takes focus so a
 * screen reader reads it, and leaves the address so a reload does not
 * confirm again.
 */
export default function SavedNotice({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const url = new URL(window.location.href)
    url.searchParams.delete('saved')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [])
  return (
    <div ref={ref} tabIndex={-1} role="status" className="banner toast-banner health-saved">
      {text}
    </div>
  )
}
