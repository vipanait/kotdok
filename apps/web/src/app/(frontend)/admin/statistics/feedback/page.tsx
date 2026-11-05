import CabinetShell from '@/components/cabinet/CabinetShell'
import AdminFrame from '@/features/admin/AdminFrame'
import FeedbackTab from '@/features/admin/FeedbackTab'
import { getAdminFeedback, getAdminFeedbackFeed, normalizeFeedbackFeedFilter, normalizeFeedShown } from '@/server/admin/statistics'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { loadAdminPage, type AdminSearchParams } from '../load-admin-page'

export const generateMetadata = privatePageMetadata(d => d.shell.statistics)

export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const { cabinet, days, params } = await loadAdminPage('feedback', searchParams)
  const filter = normalizeFeedbackFeedFilter(params.filter)
  const shown = normalizeFeedShown(params.shown)
  const dict = await getDictionary(await getLocale())
  const [feedback, comments] = await Promise.all([getAdminFeedback(days), getAdminFeedbackFeed(days, filter, shown)])

  return (
    <CabinetShell cabinet={cabinet} crumb={dict.admin.statistics.crumb}>
      <AdminFrame tab="feedback" days={days}>
        <FeedbackTab feedback={feedback} comments={comments} filter={filter} shown={shown} />
      </AdminFrame>
    </CabinetShell>
  )
}
