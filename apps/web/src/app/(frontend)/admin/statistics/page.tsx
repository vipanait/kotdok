import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import AdminStatisticsClient from '@/features/admin/AdminStatisticsClient'
import { loadAdminUser } from '@/server/auth/admin-user'
import { getAdminStatistics, normalizeAdminStatisticsPeriod } from '@/server/admin/statistics'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'

export const metadata: Metadata = {
  title: 'Статистика — Лапка',
  robots: { index: false, follow: false },
}

export default async function AdminStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>
}) {
  const params = await searchParams
  const days = normalizeAdminStatisticsPeriod(params.days)

  const admin = await loadAdminUser()
  if (!admin.ok) {
    redirect(
      admin.reason === 'signed_out'
        ? `/login?next=${encodeURIComponent(`/admin/statistics?days=${days}`)}`
        : '/dashboard',
    )
  }

  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const statistics = await getAdminStatistics(days)
  const t = dict.admin.statistics

  return (
    <AppShell right={
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">{dict.common.backToAccount}</Link>
    }>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">{t.kicker}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{t.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{t.subtitle}</p>
      </div>

      <AdminStatisticsClient statistics={statistics} />
    </AppShell>
  )
}
