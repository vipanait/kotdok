'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from '@/components/LocaleProvider'
import { csrfHeaders } from '@/shared/security/csrf-client'

type Stage =
  | { kind: 'idle' }
  /** Nothing is sent yet: the page asks once more before the irreversible step. */
  | { kind: 'confirm' }
  | { kind: 'working' }
  /** The session is real but old. Signing in again is the fix, not an error. */
  | { kind: 'reauth' }
  | { kind: 'accepted'; receipt: string }
  | { kind: 'failed' }

const LOGIN_AGAIN = '/login?next=/account-deletion'

/**
 * The button, and the two things that must happen in order behind it.
 *
 * The receipt is made here and written down **before** the request goes: the
 * case it exists for is an answer that never arrives, and one created after the
 * answer would be missing exactly then. It is kept in `localStorage` rather
 * than with the session, because the session is about to stop existing and the
 * receipt has to outlive it.
 *
 * The first press only asks "for good?"; the request starts from the second.
 */
export default function DeleteAccountForm() {
  const t = useTranslations().deletion.form
  const router = useRouter()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const startRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  // Where focus goes after the next render: the confirmation opens on
  // "Cancel", closing it returns to the button that opened it, and an outcome
  // is read out from its own message.
  const focusNext = useRef<'cancel' | 'start' | 'status' | null>(null)

  useEffect(() => {
    const target = focusNext.current
    focusNext.current = null
    if (target === 'cancel') cancelRef.current?.focus()
    else if (target === 'start') startRef.current?.focus()
    else if (target === 'status') statusRef.current?.focus()
  }, [stage])

  function openConfirm() {
    focusNext.current = 'cancel'
    setStage({ kind: 'confirm' })
  }

  function closeConfirm() {
    focusNext.current = 'start'
    setStage({ kind: 'idle' })
  }

  async function run() {
    // The pressed button is disabled while the request runs; keep focus on
    // the (busy) confirmation instead of dropping it to the page.
    focusNext.current = 'status'
    setStage({ kind: 'working' })
    try {
      const proof = await fetch('/api/account-deletion/reauth', {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: '{}',
      })

      if (proof.status === 401) {
        focusNext.current = 'status'
        setStage({ kind: 'reauth' })
        return
      }
      if (!proof.ok) {
        focusNext.current = 'status'
        setStage({ kind: 'failed' })
        return
      }

      const { token } = (await proof.json()) as { token: string }

      const bytes = new Uint8Array(32)
      crypto.getRandomValues(bytes)
      const receipt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

      try {
        localStorage.setItem('lapka.deletion-receipt', receipt)
      } catch {
        // A browser that refuses storage still gets to delete the account; they
        // just lose the way to check the status later, and the page says so.
      }

      const response = await fetch('/api/account-deletion', {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ receipt_secret: receipt, reauth_token: token }),
      })

      focusNext.current = 'status'
      if (response.status === 202) {
        setStage({ kind: 'accepted', receipt })
        // The cabinet is closed from now on; drop the page's links to it.
        router.refresh()
      } else {
        setStage({ kind: 'failed' })
      }
    } catch {
      // No answer at all (the network, most likely). Same as a refusal: say so
      // and offer to try again, rather than spinning forever.
      focusNext.current = 'status'
      setStage({ kind: 'failed' })
    }
  }

  /**
   * A signed-in visitor is sent from /login straight to the cabinet, so
   * "sign in again" has to end the old session first. Whatever the answer,
   * the login page is where they go next.
   */
  async function signInAgain() {
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: csrfHeaders(),
        redirect: 'manual',
      })
    } finally {
      router.push(LOGIN_AGAIN)
    }
  }

  if (stage.kind === 'accepted') {
    return (
      <div ref={statusRef} tabIndex={-1} className="deletion-outcome" role="status">
        <h3>{t.acceptedTitle}</h3>
        <p>{t.accepted}</p>
        <p className="deletion-receipt-label" id="deletion-receipt-label">{t.receiptLabel}</p>
        <p className="deletion-receipt" aria-labelledby="deletion-receipt-label">
          {stage.receipt}
        </p>
        <p className="small">{t.receiptHint}</p>
      </div>
    )
  }

  if (stage.kind === 'reauth') {
    return (
      <div ref={statusRef} tabIndex={-1} className="deletion-outcome">
        <div className="banner" role="status">{t.reauth}</div>
        <a
          href={LOGIN_AGAIN}
          className="btn primary"
          onClick={(event) => {
            event.preventDefault()
            void signInAgain()
          }}
        >
          {t.reauthAction}
        </a>
      </div>
    )
  }

  if (stage.kind === 'confirm' || stage.kind === 'working') {
    const working = stage.kind === 'working'
    return (
      <div
        ref={statusRef}
        tabIndex={-1}
        className="deletion-confirm"
        role="group"
        aria-labelledby="deletion-confirm-title"
        aria-describedby="deletion-confirm-text"
        aria-busy={working}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !working) {
            event.preventDefault()
            closeConfirm()
          }
        }}
      >
        <h3 id="deletion-confirm-title">{t.confirmTitle}</h3>
        <p id="deletion-confirm-text">{t.confirmText}</p>
        <div className="row">
          <button
            type="button"
            className="btn danger solid"
            onClick={() => void run()}
            disabled={working}
          >
            {working ? t.working : t.confirm}
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="btn secondary"
            onClick={closeConfirm}
            disabled={working}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="deletion-outcome" ref={statusRef} tabIndex={-1}>
      {stage.kind === 'failed' ? (
        <p className="banner error" role="alert">{t.failed}</p>
      ) : null}

      {stage.kind === 'failed' ? (
        <button type="button" className="btn danger solid" onClick={() => void run()}>
          {t.retry}
        </button>
      ) : (
        <button ref={startRef} type="button" className="btn danger" onClick={openConfirm}>
          {t.start}
        </button>
      )}
    </div>
  )
}
