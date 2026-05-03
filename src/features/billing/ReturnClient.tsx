'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TxStatus } from '@/shared/types/billing'
import { formatMoney, isTerminalStatus, TX_STATUS_LABEL } from '@/shared/utils/billing-format'

interface TransactionView {
  id: string
  current_status: TxStatus
  amount: number
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
      <div className="bg-card rounded-3xl overflow-hidden">
        <div className="bg-status-good-bg p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="font-serif text-3xl font-bold text-status-good-fg mb-2">Оплата прошла</h1>
          {tx && (
            <p className="text-sm font-semibold text-text">
              На баланс начислено {tx.units_total} проверок
            </p>
          )}
          {tx && (
            <p className="text-xs text-text-muted mt-1">
              {packageName} · {formatMoney(tx.amount, tx.currency)}
            </p>
          )}
        </div>
        <div className="p-6 text-center">
          <Link
            href="/dashboard"
            className="inline-block rounded-full bg-accent text-white px-6 py-3 font-semibold hover:bg-accent-hover transition-colors"
          >
            В личный кабинет
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'failed' || status === 'canceled') {
    return (
      <div className="bg-card rounded-3xl overflow-hidden">
        <div className="bg-status-error-bg p-8 text-center">
          <div className="text-4xl mb-3">{status === 'canceled' ? '⏹' : '❌'}</div>
          <h1 className="font-serif text-3xl font-bold text-status-error-fg mb-2">
            {status === 'canceled' ? 'Оплата отменена' : 'Оплата не прошла'}
          </h1>
          <p className="text-sm text-text-muted">С карты ничего не списано. Можно попробовать ещё раз.</p>
        </div>
        <div className="p-6 flex gap-3">
          <Link
            href="/pricing"
            className="flex-1 rounded-full bg-accent text-white px-4 py-3 font-semibold hover:bg-accent-hover transition-colors text-sm text-center"
          >
            Попробовать снова
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 rounded-full bg-card border border-hairline text-text px-4 py-3 font-medium hover:bg-canvas-soft transition-colors text-sm text-center"
          >
            В кабинет
          </Link>
        </div>
      </div>
    )
  }

  if (timedOut) {
    return (
      <div className="bg-card rounded-3xl overflow-hidden">
        <div className="bg-status-pending-bg p-8 text-center">
          <div className="text-4xl mb-3">⏳</div>
          <h1 className="font-serif text-3xl font-bold text-status-pending-fg mb-2">Платёж обрабатывается</h1>
          <p className="text-sm text-text-muted">
            Банк ещё не прислал подтверждение. Кредиты начислятся автоматически, как только оно придёт.
          </p>
        </div>
        <div className="p-6 text-center">
          <Link
            href="/billing"
            className="inline-block rounded-full bg-accent text-white px-6 py-3 font-semibold hover:bg-accent-hover transition-colors"
          >
            История операций
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-3xl p-8 text-center">
      <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-accent" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <h1 className="font-serif text-2xl font-bold text-text mb-1">Ждём подтверждения банка</h1>
      <p className="text-sm text-text-muted">
        Статус: {TX_STATUS_LABEL[status]}. Обычно занимает несколько секунд.
      </p>
      {error && <p className="text-xs text-text-faint mt-2">{error}</p>}
    </div>
  )
}
