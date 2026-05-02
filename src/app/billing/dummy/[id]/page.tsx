import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/billing-format'
import DummyLogo from '@/components/DummyLogo'
import DummyCheckoutClient from './DummyCheckoutClient'

export const metadata: Metadata = {
  title: 'Тестовая оплата — Лапка',
  robots: { index: false, follow: false },
}

interface TxRow {
  id: string
  user_id: string
  provider: string
  current_status: string
  amount: number
  currency: string
  units_total: number
  package: { name: string } | { name: string }[] | null
}

export default async function DummyCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ save?: string }>
}) {
  const { id } = await params
  const { save } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/billing/dummy/${id}`)

  const service = createServiceClient()
  const { data: txRaw } = await service
    .from('transactions')
    .select('id, user_id, provider, current_status, amount, currency, units_total, package:packages(name)')
    .eq('id', id)
    .single()

  if (!txRaw) notFound()
  const tx = txRaw as TxRow

  if (tx.user_id !== user.id) notFound()
  if (tx.provider !== 'dummy') notFound()

  // If already terminal, just bounce to the return page.
  if (['succeeded', 'failed', 'canceled', 'refunded'].includes(tx.current_status)) {
    redirect(`/billing/return/${id}`)
  }

  const packageName = Array.isArray(tx.package) ? tx.package[0]?.name : tx.package?.name
  const willSaveCard = save === '1'

  return (
    <div className="min-h-screen bg-[#F7F6F4] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <DummyLogo width={140} height={44} />
          <p className="text-xs uppercase tracking-wide text-gray-400 mt-2">Тестовая платёжная система</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Подтвердите оплату</h1>
          <p className="text-sm text-gray-500 mb-5">
            Это mock-страница. Реальный банк не задействован.
          </p>

          <div className="rounded-xl bg-gray-50 p-4 mb-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-600">{packageName ?? 'Пакет'}</span>
              <span className="text-lg font-bold">{formatMoney(tx.amount, tx.currency)}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">{tx.units_total} проверок</div>
          </div>

          <DummyCheckoutClient transactionId={id} willSaveCard={willSaveCard} />
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Подтверждение придёт на наш сервер через симулированный webhook.
        </p>
      </div>
    </div>
  )
}
