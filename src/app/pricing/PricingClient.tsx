'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Package, PaymentMethod } from '@/types/billing'
import { formatMoney } from '@/lib/billing-format'

interface Props {
  packages: Package[]
  methods: PaymentMethod[]
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
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500">
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package_id: selectedPackageId, save_payment_method: saveCard }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'purchase_failed')
        if (data.redirect_url) {
          window.location.href = data.redirect_url
          return
        }
        router.push(`/billing/return/${data.transaction_id}`)
      } else {
        const res = await fetch('/api/billing/purchase/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package_id: selectedPackageId, payment_method_id: payMode }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'purchase_failed')
        router.push(`/billing/return/${data.transaction_id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка. Попробуйте ещё раз.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Package cards */}
      <div className="grid gap-3">
        {packages.map(pkg => {
          const selected = pkg.id === selectedPackageId
          const perUnit = formatMoney(pkg.unit_price_cents, pkg.currency)
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setSelectedPackageId(pkg.id)}
              className={`text-left rounded-2xl border-2 p-5 transition-colors ${
                selected
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-lg font-semibold text-gray-900">{pkg.name}</span>
                <span className="text-xl font-bold text-gray-900">
                  {formatMoney(pkg.price_cents, pkg.currency)}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {perUnit} за проверку · {pkg.units} проверок
              </div>
            </button>
          )
        })}
      </div>

      {/* Payment method */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">Способ оплаты</p>
        <div className="space-y-2">
          {methods.map(pm => (
            <label
              key={pm.id}
              className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                payMode === pm.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="pay-mode"
                checked={payMode === pm.id}
                onChange={() => setPayMode(pm.id)}
                className="accent-orange-500"
              />
              <div className="flex-1 text-sm">
                <span className="font-medium text-gray-800">
                  {pm.brand ?? 'Карта'} •••• {pm.last4 ?? '????'}
                </span>
                {pm.exp_month && pm.exp_year && (
                  <span className="text-gray-400 ml-2">
                    {String(pm.exp_month).padStart(2, '0')}/{String(pm.exp_year).slice(-2)}
                  </span>
                )}
              </div>
            </label>
          ))}

          <label
            className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
              payMode === 'new' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="pay-mode"
              checked={payMode === 'new'}
              onChange={() => setPayMode('new')}
              className="accent-orange-500"
            />
            <span className="flex-1 text-sm font-medium text-gray-800">
              {methods.length ? 'Новая карта' : 'Оплатить картой'}
            </span>
          </label>

          {payMode === 'new' && (
            <label className="flex items-center gap-2 pt-1 pl-3 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={saveCard}
                onChange={e => setSaveCard(e.target.checked)}
                className="accent-orange-500"
              />
              Сохранить карту для быстрых покупок
            </label>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <button
        type="button"
        onClick={handleBuy}
        disabled={loading || !selectedPackageId}
        className="w-full bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Переходим к оплате...' : 'Оплатить'}
      </button>
    </div>
  )
}
