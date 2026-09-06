'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Package, PublicPaymentMethod } from '@/shared/types/billing'
import { formatMoney } from '@/shared/utils/billing-format'
import { csrfHeaders } from '@/shared/security/csrf-client'

interface Props {
  packages: Package[]
  methods: PublicPaymentMethod[]
}

type PayMode = 'new' | string // string = payment_method_id

export default function PricingClient({ packages, methods }: Props) {
  const router = useRouter()
  const [selectedPackageId, setSelectedPackageId] = useState<string>(packages[0]?.id ?? '')
  const [payMode, setPayMode] = useState<PayMode>(methods[0]?.id ?? 'new')
  const [saveCard, setSaveCard] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!packages.length) {
    return (
      <div className="text-sm text-text-muted">
        Сейчас нет активных пакетов. Попробуйте позже.
      </div>
    )
  }

  async function handleBuy() {
    if (!selectedPackageId) return
    setLoading(true)
    setError('')

    try {
      if (payMode === 'new') {
        const res = await fetch('/api/billing/purchase', {
          method: 'POST',
          headers: csrfHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ package_id: selectedPackageId, save_payment_method: saveCard }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail ?? data.error ?? 'purchase_failed')
        if (data.redirect_url) {
          window.location.href = data.redirect_url
          return
        }
        router.push(`/billing/return/${data.transaction_id}`)
      } else {
        const res = await fetch('/api/billing/purchase/saved', {
          method: 'POST',
          headers: csrfHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ package_id: selectedPackageId, payment_method_id: payMode }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail ?? data.error ?? 'purchase_failed')
        router.push(`/billing/return/${data.transaction_id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка. Попробуйте ещё раз.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Package cards */}
      <div className="grid gap-3">
        {packages.map(pkg => {
          const selected = pkg.id === selectedPackageId
          const perUnit = formatMoney(pkg.unit_price, pkg.currency)
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setSelectedPackageId(pkg.id)}
              className={`text-left rounded-2xl border-2 p-5 transition-colors ${
                selected
                  ? 'border-accent bg-card-soft/60'
                  : 'border-hairline bg-card hover:border-card-soft-strong'
              }`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-lg font-semibold text-text">{pkg.name}</span>
                <span className="font-extrabold text-2xl text-text">
                  {formatMoney(pkg.amount, pkg.currency)}
                </span>
              </div>
              <div className="text-xs text-text-muted">
                {perUnit} за проверку · {pkg.units} проверок
              </div>
            </button>
          )
        })}
      </div>

      {/* Payment method */}
      <div>
        <p className="text-sm font-semibold text-text mb-3">Способ оплаты</p>
        <div className="space-y-2">
          {methods.map(pm => (
            <label
              key={pm.id}
              className={`flex items-center gap-3 rounded-2xl border p-3 cursor-pointer transition-colors ${
                payMode === pm.id ? 'border-accent bg-card-soft/60' : 'border-hairline hover:bg-canvas-soft/50'
              }`}
            >
              <input
                type="radio"
                name="pay-mode"
                checked={payMode === pm.id}
                onChange={() => setPayMode(pm.id)}
                className="accent-[var(--accent)]"
              />
              <div className="flex-1 text-sm flex items-center gap-3">
                <span className="inline-flex items-center justify-center rounded-md bg-[#1A1F71] text-white text-[10px] font-bold tracking-wide px-2 py-1">
                  {pm.brand?.toUpperCase() ?? 'CARD'}
                </span>
                <span className="font-medium text-text">
                  •••• {pm.last4 ?? '????'}
                </span>
                {pm.exp_month && pm.exp_year && (
                  <span className="text-text-faint">
                    {String(pm.exp_month).padStart(2, '0')}/{String(pm.exp_year).slice(-2)}
                  </span>
                )}
              </div>
            </label>
          ))}

          <label
            className={`flex items-center gap-3 rounded-2xl border p-3 cursor-pointer transition-colors ${
              payMode === 'new' ? 'border-accent bg-card-soft/60' : 'border-hairline hover:bg-canvas-soft/50'
            }`}
          >
            <input
              type="radio"
              name="pay-mode"
              checked={payMode === 'new'}
              onChange={() => setPayMode('new')}
              className="accent-[var(--accent)]"
            />
            <span className="flex-1 text-sm font-medium text-text">
              {methods.length ? 'Новая карта' : 'Оплатить картой'}
            </span>
          </label>

          {payMode === 'new' && (
            <label className="flex items-center gap-2 pt-1 pl-3 text-sm text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={saveCard}
                onChange={e => setSaveCard(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Сохранить карту для быстрых покупок
            </label>
          )}
        </div>
      </div>

      {error && <div className="bg-status-error-bg text-status-error-fg text-sm rounded-xl px-4 py-3">{error}</div>}

      <button
        type="button"
        onClick={handleBuy}
        disabled={loading || !selectedPackageId}
        className="w-full rounded-full bg-accent text-white py-4 font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Переходим к оплате...' : 'Оплатить'}
      </button>
    </div>
  )
}
