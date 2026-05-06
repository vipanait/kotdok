'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/components/LocaleProvider'

type ExtraCheckRequestStatus = 'pending' | 'approved' | 'rejected' | null

interface Props {
  credits: number
  latestRequestStatus: ExtraCheckRequestStatus
}

function statusText(status: ExtraCheckRequestStatus, t: ReturnType<typeof useTranslations>['dashboard']) {
  if (status === 'pending') return t.requestPending
  if (status === 'approved') return t.requestApproved
  if (status === 'rejected') return t.requestRejected
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
      const response = await fetch('/api/credits/request-extra', { method: 'POST' })
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
    <div className="mt-5 rounded-2xl bg-accent-soft px-4 py-4 text-sm text-accent-text">
      <p>{statusText(latestRequestStatus, t)}</p>
      {canRequest && (
        <button
          type="button"
          onClick={handleRequest}
          disabled={loading}
          className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
