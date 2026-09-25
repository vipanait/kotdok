'use client'

import { useEffect, useId, useRef } from 'react'

interface Props {
  title: string
  body: string
  cancelLabel: string
  confirmLabel: string
  /** Shown on the confirm button while `busy`. */
  busyLabel?: string
  busy?: boolean
  /** A failed confirm: shown inside the dialog, which stays open. */
  error?: string
  tone?: 'danger' | 'primary'
  onCancel: () => void
  onConfirm: () => void
  /** Where focus goes back when the dialog closes; the focused element by default. */
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A modal question with two answers. Focus moves to "Cancel" — the safe
 * answer — and stays inside until the dialog closes; Escape and the backdrop
 * cancel unless the confirm is in flight. On close focus returns to the
 * control that opened it.
 */
export default function ConfirmDialog({
  title,
  body,
  cancelLabel,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  tone = 'primary',
  onCancel,
  onConfirm,
  returnFocusRef,
}: Props) {
  const titleId = useId()
  const bodyId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnRef.current = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null)
    cancelRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      const target = returnRef.current
      if (target && target.isConnected) target.focus()
    }
    // Only on open and close: the element to return to is fixed at opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (!busy) onCancel()
      return
    }
    if (e.key !== 'Tab' || !dialogRef.current) return

    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        {error && <p role="alert" className="banner error modal-error">{error}</p>}
        <div className="row">
          <button
            ref={cancelRef}
            type="button"
            className="btn secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn danger solid' : 'btn primary'}
            onClick={() => { if (!busy) onConfirm() }}
            // Not `disabled`: the pressed button keeps focus while the request runs.
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
