'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ApiError } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { browserApi } from '@/features/api/browser-api'
import Icon from '@/components/ui/Icon'
import {
  canRequestExtraCheck,
  creditsState,
  type ExtraCheckRequestStatus,
} from '@/features/credits/credits-state'
import { formatCount } from '@/shared/i18n/plural'

interface Props {
  credits: number
  latestRequestStatus: ExtraCheckRequestStatus
}

/**
 * The balance and the next step it allows: start a check, ask for an extra
 * one, or wait for the answer. A request goes through the shared client
 * (POST /credits/extra-request); the page is then refreshed so the server's
 * state — pending — is what shows.
 */
export default function CreditsBalanceCard({ credits, latestRequestStatus }: Props) {
  const dict = useTranslations()
  const locale = useLocale()
  const t = dict.credits
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Kept busy until the refreshed page arrives, so the button cannot flash back.
  const [refreshing, startRefresh] = useTransition()
  const busy = loading || refreshing
  const titleRef = useRef<HTMLHeadingElement>(null)
  /** Set when our own request changed the state: its new heading takes focus. */
  const announce = useRef(false)

  const state = creditsState(credits, latestRequestStatus)
  const canRequest = canRequestExtraCheck(credits, latestRequestStatus)

  // The request button goes away once the request is in; keep focus on the card.
  useEffect(() => {
    if (!announce.current || refreshing) return
    announce.current = false
    titleRef.current?.focus()
  }, [state, refreshing])

  async function handleRequest(): Promise<void> {
    if (!canRequest || busy) return
    setLoading(true)
    setError('')

    try {
      await browserApi().requestExtraCheck()
      announce.current = true
      startRefresh(() => router.refresh())
    } catch (error) {
      // A request already pending, or checks back on the balance: the state
      // changed elsewhere, so show what is true now.
      if (error instanceof ApiError && error.code === 'conflict') {
        startRefresh(() => router.refresh())
        return
      }
      setError(error instanceof ApiError && error.code === 'rate_limited' ? t.rateLimited : t.requestError)
    } finally {
      setLoading(false)
    }
  }

  const title = {
    ready: t.readyTitle,
    pending: t.pendingTitle,
    rejected: t.rejectedTitle,
    out: t.outTitle,
  }[state]
  const body = {
    ready: formatCount(t.readyBody, credits, locale),
    pending: t.pendingBody,
    rejected: t.rejectedBody,
    out: t.outBody,
  }[state]
  const note = state === 'ready'
    ? latestRequestStatus === 'pending' ? t.pendingNote : latestRequestStatus === 'approved' ? t.approvedNote : null
    : null

  return (
    <section className="card credits-card" aria-labelledby="credits-state-title">
      <span className="small muted">{t.balance}</span>
      <div className="balance-big">{credits}</div>

      {/* Announced when a sent request turns the card into "request sent". */}
      <div aria-live="polite">
        <h2 id="credits-state-title" ref={titleRef} tabIndex={-1}>{title}</h2>
        <p className="credits-body">{body}</p>
        {note && <p className="small muted credits-note">{note}</p>}
      </div>

      {error && <p role="alert" className="banner error credits-error">{error}</p>}

      <div className="credits-action">
        {state === 'ready' && (
          <Link href="/check" className="btn primary">
            {t.checkCta}
            <Icon name="arrow" />
          </Link>
        )}
        {state === 'pending' && (
          <button type="button" className="btn secondary" disabled>
            {t.pendingButton}
          </button>
        )}
        {canRequest && (
          <button
            type="button"
            className="btn primary"
            onClick={handleRequest}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
          >
            {busy ? t.requesting : t.requestCta}
          </button>
        )}
      </div>

      <div className="credits-back">
        <Link href="/dashboard" className="link">{t.backToAccount}</Link>
      </div>
    </section>
  )
}
