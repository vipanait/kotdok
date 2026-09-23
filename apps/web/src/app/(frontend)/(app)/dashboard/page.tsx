import { redirect } from 'next/navigation'
import DashboardContent from '@/features/dashboard/DashboardContent'
import { parsePetSaved } from '@/features/pets/PetSavedBanner'
import { loadCabinetUser } from '@/server/cabinet/load-cabinet'
import { loadDashboard } from '@/server/dashboard/load-dashboard'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ petSaved?: string | string[] }>
}) {
  const cabinet = await loadCabinetUser()
  if (!cabinet) redirect('/login?next=/dashboard')

  const [data, params] = await Promise.all([loadDashboard(cabinet.user.id), searchParams])
  return <DashboardContent cabinet={cabinet} data={data} petSaved={parsePetSaved(params.petSaved)} />
}
