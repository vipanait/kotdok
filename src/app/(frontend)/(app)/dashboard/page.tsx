import DashboardContent from '@/features/dashboard/DashboardContent'
import { loadDashboard } from '@/server/dashboard/load-dashboard'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ catSaved?: string }>
}) {
  const data = await loadDashboard()
  const params = await searchParams
  return <DashboardContent data={data} catSavedParam={params.catSaved} />
}
