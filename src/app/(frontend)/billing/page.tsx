import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/server/supabase/server'
import type { PublicPaymentMethod, TxStatus } from '@/shared/types/billing'
import { formatMoney, TX_STATUS_LABEL, TX_STATUS_STYLE } from '@/shared/utils/billing-format'
import BillingMethodsClient from '@/features/billing/BillingMethodsClient'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'История операций',
  robots: { index: false, follow: false },
}

interface TxRow {
  id: string
  current_status: TxStatus
  amount: number
  currency: string
  units_total: number
  created_at: string
  package: { name: string } | { name: string }[] | null
}

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/billing')

  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.billing

  const service = createServiceClient()
  const [{ data: txRaw }, { data: methodsRaw }] = await Promise.all([
    service
      .from('transactions')
      .select('id, current_status, amount, currency, units_total, created_at, package:packages(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    service
      .from('payment_methods')
      .select('id, provider, brand, last4, exp_month, exp_year, is_default, created_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const transactions = (txRaw ?? []) as TxRow[]
  const methods = (methodsRaw ?? []) as PublicPaymentMethod[]

  return (
    <AppShell right={
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">{dict.common.backToAccount}</Link>
    }>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
        <Link
          href="/pricing"
          className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          {t.topUp}
        </Link>
      </div>

      {/* Saved cards */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">{t.savedCards}</h2>
        {methods.length ? (
          <BillingMethodsClient initialMethods={methods} />
        ) : (
          <p className="text-sm text-gray-500">{t.noSavedCards}</p>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-3">{t.transactions}</h2>
        {!transactions.length ? (
          <p className="text-sm text-gray-500">{t.noTransactions}</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {transactions.map(tx => {
              const pkgName = Array.isArray(tx.package) ? tx.package[0]?.name : tx.package?.name
              return (
                <li key={tx.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {pkgName ?? t.checks.replace('{n}', String(tx.units_total))}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(tx.created_at).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
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
                      {formatMoney(tx.amount, tx.currency)}
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
    </AppShell>
  )
}
