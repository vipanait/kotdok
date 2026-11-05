import CabinetShell from '@/components/cabinet/CabinetShell'
import AdminFrame from '@/features/admin/AdminFrame'
import ChecksTab from '@/features/admin/ChecksTab'
import { getAdminCheckFeed, getAdminChecks, normalizeCheckFeedFilter, normalizeFeedShown } from '@/server/admin/statistics'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { loadAdminPage, type AdminSearchParams } from '../load-admin-page'

export const generateMetadata = privatePageMetadata(d => d.shell.statistics)

export default async function AdminChecksPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const { cabinet, days, params } = await loadAdminPage('checks', searchParams)
  const filter = normalizeCheckFeedFilter(params.filter)
  const shown = normalizeFeedShown(params.shown)
  const dict = await getDictionary(await getLocale())
  const [checks, feed] = await Promise.all([getAdminChecks(days), getAdminCheckFeed(days, filter, shown)])

  return (
    <CabinetShell cabinet={cabinet} crumb={dict.admin.statistics.crumb}>
      <AdminFrame tab="checks" days={days}>
        <ChecksTab checks={checks} feed={feed} filter={filter} shown={shown} />
      </AdminFrame>
    </CabinetShell>
  )
}
