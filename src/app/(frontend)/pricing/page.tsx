import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/server/supabase/server'
import PricingClient from '@/features/billing/PricingClient'
import type { Package, PublicPaymentMethod } from '@/shared/types/billing'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'Пополнить',
  robots: { index: false, follow: false },
}

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/pricing')

  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.pricing

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
      .select('id, provider, brand, last4, exp_month, exp_year, is_default, created_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const packages = (packagesRaw ?? []) as Package[]
  const methods = (methodsRaw ?? []) as PublicPaymentMethod[]
  const credits = profile?.credits ?? 0

  return (
    <AppShell right={
      <Link href="/dashboard" className="text-text-muted hover:text-text">{dict.common.back}</Link>
    }>
      <div className="mb-6 sm:mb-8">
        <p className="text-xs font-semibold tracking-wider text-text-muted uppercase">{dict.billing.kicker}</p>
        <h1 className="font-serif italic text-4xl sm:text-5xl font-bold text-text mt-1 leading-none">{t.title}</h1>
        <p className="text-sm text-text-muted mt-3">
          {t.availableChecks.replace('{n}', String(credits))}
        </p>
      </div>

      <div className="bg-card rounded-3xl p-6 sm:p-8">
        <PricingClient packages={packages} methods={methods} />
      </div>

      <p className="text-xs text-text-faint mt-6 text-center">
        {t.paymentNote}
      </p>
    </AppShell>
  )
}
