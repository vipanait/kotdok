import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { PaymentMethod, TxStatus } from '@/types/billing'
import { formatMoney, TX_STATUS_LABEL, TX_STATUS_STYLE } from '@/lib/billing-format'
import BillingMethodsClient from './BillingMethodsClient'

export const metadata: Metadata = {
  title: 'История операций — КотДок',
  robots: { index: false, follow: false },
}

interface TxRow {
  id: string
  current_status: TxStatus
  amount_cents: number
  currency: string
  units_total: number
  created_at: string
  package: { name: string } | { name: string }[] | null
}

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/billing')

  const service = createServiceClient()
  const [{ data: txRaw }, { data: methodsRaw }] = await Promise.all([
    service
      .from('transactions')
      .select('id, current_status, amount_cents, currency, units_total, created_at, package:packages(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    service
      .from('payment_methods')
      .select('id, user_id, provider, provider_pm_id, brand, last4, exp_month, exp_year, is_default, created_at, deleted_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const transactions = (txRaw ?? []) as TxRow[]
  const methods = (methodsRaw ?? []) as PaymentMethod[]

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-2xl font-bold">🐱 КотДок</Link>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← В кабинет</Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">История операций</h1>
        <Link
          href="/pricing"
          className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          Пополнить
        </Link>
      </div>

      {/* Saved cards */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Сохранённые карты</h2>
        {methods.length ? (
          <BillingMethodsClient initialMethods={methods} />
        ) : (
          <p className="text-sm text-gray-500">Нет сохранённых карт. Поставьте галочку «Сохранить карту» при следующей покупке.</p>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Операции</h2>
        {!transactions.length ? (
          <p className="text-sm text-gray-500">Операций пока нет.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {transactions.map(tx => {
              const pkgName = Array.isArray(tx.package) ? tx.package[0]?.name : tx.package?.name
              return (
                <li key={tx.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {pkgName ?? 'Пакет'} · {tx.units_total} проверок
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(tx.created_at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatMoney(tx.amount_cents, tx.currency)}
                    </div>
                    <span className={`inline-block mt-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${TX_STATUS_STYLE[tx.current_status]}`}>
                      {TX_STATUS_LABEL[tx.current_status]}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
