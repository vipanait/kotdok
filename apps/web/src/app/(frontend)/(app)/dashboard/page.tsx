import DashboardContent from '@/features/dashboard/DashboardContent'
import { parsePetSaved } from '@/features/pets/pet-saved'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { loadDashboard } from '@/server/dashboard/load-dashboard'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.shell.account)

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ petSaved?: string | string[] }>
}) {
  const cabinet = await requireCabinet('/login?next=/dashboard')

  const [data, params] = await Promise.all([loadDashboard(cabinet.user.id), searchParams])
  return <DashboardContent cabinet={cabinet} data={data} petSaved={parsePetSaved(params.petSaved)} />
}
