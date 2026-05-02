import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import PricingClient from './PricingClient'
import type { Package, PaymentMethod } from '@/types/billing'

export const metadata: Metadata = {
  title: 'Пополнить — Лапка',
  robots: { index: false, follow: false },
}

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/pricing')

  const service = createServiceClient()
  const [{ data: packagesRaw }, { data: profile }, { data: methodsRaw }] = await Promise.all([
    service
      .from('packages')
      .select('id, code, name, units, unit_price, amount, currency, is_active, sort_order, created_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    service.from('profiles').select('credits').eq('id', user.id).single(),
    service
      .from('payment_methods')
      .select('id, user_id, provider, provider_pm_id, brand, last4, exp_month, exp_year, is_default, created_at, deleted_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const packages = (packagesRaw ?? []) as Package[]
  const methods = (methodsRaw ?? []) as PaymentMethod[]
  const credits = profile?.credits ?? 0

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-2xl font-bold">🐱 Лапка</Link>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Назад</Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Пополнить баланс</h1>
        <p className="text-sm text-gray-500">
          Сейчас доступно проверок: <span className="font-medium text-gray-900">{credits}</span>
        </p>
      </div>

      <PricingClient packages={packages} methods={methods} />

      <p className="text-xs text-gray-400 mt-6 text-center">
        Оплата проходит через Tinkoff. Карта сохраняется по желанию для быстрых повторных покупок.
      </p>
    </div>
  )
}
