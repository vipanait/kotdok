import DashboardContent from '@/features/dashboard/DashboardContent'
import { parsePetSaved } from '@/features/pets/pet-saved'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { loadDashboard } from '@/server/dashboard/load-dashboard'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { getTimeZone } from '@/server/i18n/get-time-zone'
import { dayInZone } from '@/shared/i18n/time-zone'

export const generateMetadata = privatePageMetadata(d => d.shell.account)

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ petSaved?: string | string[] }>
}) {
  const cabinet = await requireCabinet('/login?next=/dashboard')

  // The owner's day, not the server's: "overdue" and "in 5 days" turn at their midnight.
  const today = dayInZone(new Date(), await getTimeZone())
  const [data, params] = await Promise.all([loadDashboard(cabinet.user.id, today), searchParams])
  return <DashboardContent cabinet={cabinet} data={data} petSaved={parsePetSaved(params.petSaved)} today={today} />
}
