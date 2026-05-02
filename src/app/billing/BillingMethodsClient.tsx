'use client'

import { useState } from 'react'
import type { PaymentMethod } from '@/types/billing'

interface Props {
  initialMethods: PaymentMethod[]
}

export default function BillingMethodsClient({ initialMethods }: Props) {
  const [methods, setMethods] = useState(initialMethods)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleDelete(id: string) {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/billing/payment-methods/${id}`, { method: 'DELETE' })
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
    return <p className="text-sm text-gray-500">Нет сохранённых карт.</p>
  }

  return (
    <>
      <ul className="space-y-2">
        {methods.map(pm => (
          <li
            key={pm.id}
            className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2"
          >
            <div className="text-sm">
              <span className="font-medium text-gray-800">
                {pm.brand ?? 'Карта'} •••• {pm.last4 ?? '????'}
              </span>
              {pm.exp_month && pm.exp_year && (
                <span className="text-gray-400 ml-2">
                  {String(pm.exp_month).padStart(2, '0')}/{String(pm.exp_year).slice(-2)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmId(pm.id)}
              className="text-xs text-red-500 hover:text-red-600"
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {confirmId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => busyId ? null : setConfirmId(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900 mb-2">Удалить карту?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Карта больше не будет доступна для быстрой оплаты. Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                disabled={busyId !== null}
                className="flex-1 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmId)}
                disabled={busyId !== null}
                className="flex-1 bg-red-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {busyId ? 'Удаляем...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
