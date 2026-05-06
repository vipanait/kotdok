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

const STATUS_BADGE_BG: Record<TxStatus, string> = {
  succeeded: 'bg-status-good-fg/15 text-status-good-fg',
  authorized: 'bg-status-good-fg/15 text-status-good-fg',
  pending: 'bg-status-pending-bg text-status-pending-fg',
  created: 'bg-status-pending-bg text-status-pending-fg',
  failed: 'bg-status-error-bg text-status-error-fg',
  canceled: 'bg-canvas-soft text-text-muted',
  refunded: 'bg-card-soft text-accent-text',
}

const TX_AVATAR_BG: Record<TxStatus, string> = {
  succeeded: 'bg-status-good-fg/15 text-status-good-fg',
  authorized: 'bg-status-good-fg/15 text-status-good-fg',
  pending: 'bg-status-pending-bg text-status-pending-fg',
  created: 'bg-status-pending-bg text-status-pending-fg',
  failed: 'bg-status-error-bg text-status-error-fg',
  canceled: 'bg-canvas-soft text-text-muted',
  refunded: 'bg-card-soft text-accent-text',
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
    <AppShell width="wide" right={
      <Link href="/dashboard" className="text-text-muted hover:text-text">{dict.common.backToAccount}</Link>
    }>
      <div className="mb-6 sm:mb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-wider text-text-muted uppercase">{t.kicker}</p>
          <h1 className="font-serif text-5xl sm:text-6xl font-bold text-text mt-2 leading-none">
            {t.title}
          </h1>
        </div>
        <Link
          href="/pricing"
          className="rounded-full bg-text text-white px-5 py-3 text-sm font-semibold hover:bg-black transition-colors shrink-0"
        >
          {t.topUp}
        </Link>
      </div>

      {/* Saved cards */}
      <section className="bg-card rounded-3xl p-6 sm:p-8 mb-6">
        <h2 className="text-lg font-bold text-text mb-4">{t.savedCards}</h2>
        {methods.length ? (
          <BillingMethodsClient initialMethods={methods} />
        ) : (
          <p className="text-sm text-text-muted">{t.noSavedCards}</p>
        )}
      </section>

      {/* Transactions */}
      <section className="bg-card rounded-3xl p-6 sm:p-8">
        <h2 className="text-lg font-bold text-text mb-4">{t.transactions}</h2>
        {!transactions.length ? (
          <p className="text-sm text-text-muted">{t.noTransactions}</p>
        ) : (
          <ul className="divide-y divide-hairline -my-3">
            {transactions.map(tx => {
              return (
                <li key={tx.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${TX_AVATAR_BG[tx.current_status]}`}>
                      +{tx.units_total}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-text truncate">
                        {t.creditAdd}
                      </p>
                      <p className="text-xs text-text-faint mt-0.5">
                        {new Date(tx.created_at).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-serif text-xl font-bold text-text">
                      {formatMoney(tx.amount, tx.currency)}
                    </div>
                    <span className={`inline-block mt-1 text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_BADGE_BG[tx.current_status] ?? TX_STATUS_STYLE[tx.current_status]}`}>
                      {TX_STATUS_LABEL[tx.current_status]}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
