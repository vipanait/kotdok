'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

/**
 * The confirmation after a save or a delete, once: it takes focus so a
 * screen reader reads it, and leaves the address so a reload does not
 * confirm again. `link`: the saved record, opened from the notice (MW-09 —
 * a save returns to the section it came from, not to the record).
 */
export default function SavedNotice({ text, link = null }: { text: string; link?: { href: string; text: string } | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const url = new URL(window.location.href)
    url.searchParams.delete('saved')
    url.searchParams.delete('record')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [])
  return (
    <div ref={ref} tabIndex={-1} role="status" className="banner toast-banner health-saved">
      <span>{text}</span>
      {link && (
        <Link href={link.href} className="link health-saved-link">
          {link.text}
        </Link>
      )}
    </div>
  )
}
