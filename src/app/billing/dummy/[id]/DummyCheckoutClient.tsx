'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Outcome = 'succeeded' | 'failed' | 'canceled'

export default function DummyCheckoutClient({
  transactionId,
  willSaveCard,
}: {
  transactionId: string
  willSaveCard: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Outcome | null>(null)
  const [error, setError] = useState('')

  async function trigger(outcome: Outcome) {
    setBusy(outcome)
    setError('')
    try {
      const res = await fetch('/api/billing/dummy/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          outcome,
          save_card: willSaveCard,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'confirm_failed')
      }
      router.push(`/billing/return/${transactionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setBusy(null)
    }
  }

  return (
    <>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => trigger('succeeded')}
          disabled={busy !== null}
          className="w-full bg-[#FC7A00] text-white py-3 rounded-xl font-semibold hover:bg-[#e36c00] transition-colors disabled:opacity-50"
        >
          {busy === 'succeeded' ? 'Подтверждаем...' : 'Оплатить'}
        </button>
        <button
          type="button"
          onClick={() => trigger('failed')}
          disabled={busy !== null}
          className="w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
        >
          {busy === 'failed' ? 'Подтверждаем...' : 'Имитировать отказ банка'}
        </button>
        <button
          type="button"
          onClick={() => trigger('canceled')}
          disabled={busy !== null}
          className="w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
        >
          {busy === 'canceled' ? 'Отменяем...' : 'Отменить оплату'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
    </>
  )
}
