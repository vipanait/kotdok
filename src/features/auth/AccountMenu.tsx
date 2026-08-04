'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import SignOutForm from '@/features/auth/SignOutForm'

interface Props {
  email: string
  signOutLabel: string
  historyLabel: string
  menuLabel: string
}

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._\-+]/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return (local.slice(0, 2) || '?').toUpperCase()
}

export default function AccountMenu({ email, signOutLabel, historyLabel, menuLabel }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="app-focus-ring flex h-10 w-10 items-center justify-center rounded-full bg-card-soft text-sm font-bold text-accent-text ring-1 ring-card-soft-strong/80 transition hover:bg-accent-soft"
        aria-label={menuLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen(v => !v)}
      >
        {initialsFromEmail(email)}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-hairline/80 bg-card py-1 shadow-[0_18px_40px_rgba(92,65,32,0.12)]"
        >
          <p className="truncate border-b border-hairline/70 px-3.5 py-2.5 text-xs text-text-muted" title={email}>
            {email}
          </p>
          <Link
            href="/checks"
            role="menuitem"
            className="block px-3.5 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-canvas-soft/70"
            onClick={() => setOpen(false)}
          >
            {historyLabel}
          </Link>
          <div role="menuitem" className="border-t border-hairline/70 px-3.5 py-2.5">
            <SignOutForm label={signOutLabel} />
          </div>
        </div>
      )}
    </div>
  )
}
