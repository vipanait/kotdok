'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * The avatar menu of the top bar — on phones the only way to sign out or to
 * the account's deletion. A native `<details>`, so it works before scripts
 * load; this adds what `<details>` lacks: Escape, a click elsewhere and
 * moving to another page all close it.
 */
export default function AccountMenu({
  label,
  initial,
  children,
}: {
  label: string
  initial: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (ref.current) ref.current.open = false
  }, [pathname])

  useEffect(() => {
    function close(focusTrigger: boolean) {
      const menu = ref.current
      if (!menu?.open) return
      menu.open = false
      if (focusTrigger) menu.querySelector('summary')?.focus()
    }
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) close(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close(true)
    }
    function onFocus(event: FocusEvent) {
      if (!ref.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
    }
  }, [])

  return (
    <details ref={ref} className="account-menu">
      <summary className="user-dot" aria-label={label}>
        <span aria-hidden>{initial}</span>
      </summary>
      <div className="account-menu-panel">{children}</div>
    </details>
  )
}
