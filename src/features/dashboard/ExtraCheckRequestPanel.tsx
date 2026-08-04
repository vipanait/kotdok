'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/components/LocaleProvider'
import { csrfHeaders } from '@/shared/security/csrf-client'

type ExtraCheckRequestStatus = 'pending' | 'approved' | 'rejected' | null

interface Props {
  credits: number
  latestRequestStatus: ExtraCheckRequestStatus
}

function statusText(
  status: ExtraCheckRequestStatus,
  credits: number,
  t: ReturnType<typeof useTranslations>['dashboard'],
) {
  if (status === 'pending') return t.requestPending
  if (status === 'rejected') return t.requestRejected
  // Approved-but-spent (or never requested) — don't keep saying the credit was just granted.
  if (status === 'approved' && credits > 0) return t.requestApproved
  return t.creditsOut
}

export default function ExtraCheckRequestPanel({ credits, latestRequestStatus }: Props) {
  const dict = useTranslations()
  const t = dict.dashboard
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canRequest = credits <= 0 && latestRequestStatus !== 'pending'

  async function handleRequest(): Promise<void> {
    if (!canRequest || loading) return
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/credits/request-extra', { method: 'POST', headers: csrfHeaders() })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error ? `${t.requestError} (${payload.error})` : t.requestError)
        return
      }
      setSuccess(t.requestSent)
      router.refresh()
    } catch {
      setError(t.requestError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-card-soft px-4 py-4 text-sm text-accent-text">
      <p className="font-medium">{statusText(latestRequestStatus, credits, t)}</p>
      {canRequest && (
        <button
          type="button"
          onClick={handleRequest}
          disabled={loading}
          className="app-button-primary mt-3 px-4 py-2 text-sm"
        >
          {loading ? t.requestingMoreChecks : t.requestMoreChecks}
        </button>
      )}
      {success && (
        <p className="mt-2 text-xs text-accent-text">{success}</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-status-error-fg">{error}</p>
      )}
    </div>
  )
}
