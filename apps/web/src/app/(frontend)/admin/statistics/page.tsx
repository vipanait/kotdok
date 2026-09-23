import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import AdminStatisticsClient from '@/features/admin/AdminStatisticsClient'
import { loadAdminUser } from '@/server/auth/admin-user'
import { getAdminStatistics, normalizeAdminStatisticsPeriod } from '@/server/admin/statistics'
import { loadCabinetUser } from '@/server/cabinet/load-cabinet'
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
  const signIn = `/login?next=${encodeURIComponent(`/admin/statistics?days=${days}`)}`

  const admin = await loadAdminUser()
  if (!admin.ok) {
    redirect(admin.reason === 'signed_out' ? signIn : '/dashboard')
  }

  // The frame's own view of the visitor. It is null only for somebody signed
  // out in between, or whose account deletion has started: neither may stay.
  const cabinet = await loadCabinetUser()
  if (!cabinet) redirect(signIn)

  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const statistics = await getAdminStatistics(days)

  return (
    <CabinetShell cabinet={cabinet} crumb={dict.admin.statistics.crumb}>
      <AdminStatisticsClient statistics={statistics} />
    </CabinetShell>
  )
}
