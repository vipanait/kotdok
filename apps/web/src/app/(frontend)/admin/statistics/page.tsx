import CabinetShell from '@/components/cabinet/CabinetShell'
import AdminFrame from '@/features/admin/AdminFrame'
import OverviewTab from '@/features/admin/OverviewTab'
import { loadAdminPage, type AdminSearchParams } from './load-admin-page'
import { getAdminFeedbackFeed, getAdminOverview } from '@/server/admin/statistics'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.shell.statistics)

/** How many comments the overview shows. */
const LATEST_COMMENTS = 3

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const { cabinet, days } = await loadAdminPage('overview', searchParams)
  const dict = await getDictionary(await getLocale())
  const [overview, comments] = await Promise.all([
    getAdminOverview(days),
    getAdminFeedbackFeed(days, 'all', LATEST_COMMENTS),
  ])

  return (
    <CabinetShell cabinet={cabinet} crumb={dict.admin.statistics.crumb}>
      <AdminFrame tab="overview" days={days}>
        <OverviewTab overview={overview} comments={comments.rows} />
      </AdminFrame>
    </CabinetShell>
  )
}
