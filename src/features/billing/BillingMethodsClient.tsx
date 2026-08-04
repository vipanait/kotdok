'use client'

import { useEffect, useState } from 'react'
import type { PublicPaymentMethod } from '@/shared/types/billing'
import { useTranslations } from '@/components/LocaleProvider'
import { csrfHeaders } from '@/shared/security/csrf-client'

interface Props {
  initialMethods: PublicPaymentMethod[]
}

export default function BillingMethodsClient({ initialMethods }: Props) {
  const dict = useTranslations()
  const [methods, setMethods] = useState(initialMethods)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!confirmId) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busyId) setConfirmId(null)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busyId, confirmId])

  async function handleDelete(id: string) {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/billing/payment-methods/${id}`, { method: 'DELETE', headers: csrfHeaders() })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'delete_failed')
      }
      setMethods(prev => prev.filter(m => m.id !== id))
      setConfirmId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить карту')
    } finally {
      setBusyId(null)
    }
  }

  if (!methods.length) {
    return <p className="text-sm text-text-muted">{dict.billing.noSavedCards}</p>
  }

  return (
    <>
      <ul className="space-y-2">
        {methods.map(pm => (
          <li
            key={pm.id}
            className="flex items-center justify-between rounded-2xl bg-card-soft/60 px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0 inline-flex items-center justify-center rounded-md bg-[#1A1F71] text-white text-[10px] font-bold tracking-wide px-2 py-1">
                {pm.brand?.toUpperCase() ?? 'CARD'}
              </span>
              <span className="text-base font-semibold text-text">
                •••• {pm.last4 ?? '????'}
              </span>
              {pm.exp_month && pm.exp_year && (
                <span className="text-sm text-text-faint">
                  {String(pm.exp_month).padStart(2, '0')}/{String(pm.exp_year).slice(-2)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmId(pm.id)}
              className="text-sm font-medium text-status-error-fg hover:underline"
            >
              {dict.billing.delete}
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="text-xs text-status-error-fg mt-2">{error}</p>}

      {confirmId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => busyId ? null : setConfirmId(null)}
        >
          <div
            className="bg-card rounded-3xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-text mb-2">Удалить карту?</h3>
            <p className="text-sm text-text-muted mb-5">
              Карта больше не будет доступна для быстрой оплаты. Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                disabled={busyId !== null}
                className="flex-1 bg-card border border-hairline text-text px-4 py-2.5 rounded-full text-sm font-medium hover:bg-canvas-soft transition-colors disabled:opacity-50"
              >
                {dict.common.cancel ?? 'Отмена'}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmId)}
                disabled={busyId !== null}
                className="flex-1 bg-status-error-fg text-white px-4 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {busyId ? 'Удаляем...' : dict.billing.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
