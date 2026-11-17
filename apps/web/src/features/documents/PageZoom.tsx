'use client'

import { useEffect, useRef } from 'react'
import Icon from '@/components/ui/Icon'

/**
 * One page of a document over the whole window, at its own size and
 * scrolled to read the small print — a phone can also pinch it. Escape,
 * the close button and a press beside the page close it; focus goes back
 * to the page that opened it.
 */
export default function PageZoom({ src, alt, closeLabel, onClose }: { src: string; alt: string; closeLabel: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div
      className="page-zoom"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Tab') {
          // The close button is the dialog's one control: Tab stays on it.
          e.preventDefault()
          if (e.key === 'Escape') onClose()
        }
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button ref={closeRef} type="button" className="btn secondary compact page-zoom-close" onClick={onClose}>
        <Icon name="close" />
        {closeLabel}
      </button>
      {/* A signed link to a private object: next/image would fetch and cache it on the server. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} />
    </div>
  )
}
