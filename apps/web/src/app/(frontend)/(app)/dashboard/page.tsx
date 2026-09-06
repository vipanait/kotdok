import { redirect } from 'next/navigation'
import DashboardContent from '@/features/dashboard/DashboardContent'
import { loadDashboard } from '@/server/dashboard/load-dashboard'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ petSaved?: string }>
}) {
  const data = await loadDashboard()
  if (!data) redirect('/login')

  const params = await searchParams
  return (
    <DashboardContent
      data={data}
      petSavedParam={params.petSaved}
    />
  )
}
