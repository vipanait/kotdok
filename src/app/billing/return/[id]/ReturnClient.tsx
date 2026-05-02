'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TxStatus } from '@/types/billing'
import { formatMoney, isTerminalStatus, TX_STATUS_LABEL } from '@/lib/billing-format'

interface TransactionView {
  id: string
  current_status: TxStatus
  amount_cents: number
  currency: string
  units_total: number
  package: { name: string } | { name: string }[] | null
}

const MAX_WAIT_MS = 90_000

export default function ReturnClient({ transactionId }: { transactionId: string }) {
  const router = useRouter()
  const [tx, setTx] = useState<TransactionView | null>(null)
  const [error, setError] = useState('')
  const [timedOut, setTimedOut] = useState(false)
  const startedAtRef = useRef<number>(Date.now())

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function tick() {
      try {
        const res = await fetch(`/api/billing/transactions/${transactionId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('fetch_failed')
        const data = (await res.json()) as TransactionView
        if (cancelled) return
        setTx(data)

        if (isTerminalStatus(data.current_status)) {
          // If paid, refresh server components so dashboard reflects the new credits balance.
          if (data.current_status === 'succeeded') router.refresh()
          return
        }

        if (Date.now() - startedAtRef.current > MAX_WAIT_MS) {
          setTimedOut(true)
          return
        }
        timer = setTimeout(tick, 2000)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Ошибка')
        timer = setTimeout(tick, 3000)
      }
    }

    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [transactionId, router])

  const status: TxStatus = tx?.current_status ?? 'created'
  const packageName = Array.isArray(tx?.package) ? tx?.package[0]?.name : tx?.package?.name

  if (status === 'succeeded') {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-2">✅</div>
        <h1 className="text-xl font-bold text-green-900 mb-1">Оплата прошла</h1>
        <p className="text-sm text-green-800 mb-1">
          {tx && `На баланс начислено ${tx.units_total} проверок`}
        </p>
        {tx && (
          <p className="text-xs text-green-700 mb-5">
            {packageName} · {formatMoney(tx.amount_cents, tx.currency)}
          </p>
        )}
        <Link
          href="/dashboard"
          className="inline-block bg-orange-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors"
        >
          В личный кабинет
        </Link>
      </div>
    )
  }

  if (status === 'failed' || status === 'canceled') {
    return (
      <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-2">{status === 'canceled' ? '⏹' : '❌'}</div>
        <h1 className="text-xl font-bold text-red-900 mb-1">
          {status === 'canceled' ? 'Оплата отменена' : 'Оплата не прошла'}
        </h1>
        <p className="text-sm text-red-800 mb-5">С карты ничего не списано. Можно попробовать ещё раз.</p>
        <div className="flex gap-3">
          <Link
            href="/pricing"
            className="flex-1 bg-orange-500 text-white px-4 py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors text-sm text-center"
          >
            Попробовать снова
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm text-center"
          >
            В кабинет
          </Link>
        </div>
      </div>
    )
  }

  if (timedOut) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-2">⏳</div>
        <h1 className="text-xl font-bold text-amber-900 mb-1">Платёж обрабатывается</h1>
        <p className="text-sm text-amber-800 mb-5">
          Банк ещё не прислал подтверждение. Проверить статус можно позже в истории операций — кредиты начислятся автоматически, как только придёт подтверждение.
        </p>
        <Link
          href="/billing"
          className="inline-block bg-orange-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors"
        >
          История операций
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
      <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-orange-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Ждём подтверждения банка</h1>
      <p className="text-sm text-gray-500">
        Статус: {TX_STATUS_LABEL[status]}. Обычно занимает несколько секунд.
      </p>
      {error && <p className="text-xs text-gray-400 mt-2">{error}</p>}
    </div>
  )
}
