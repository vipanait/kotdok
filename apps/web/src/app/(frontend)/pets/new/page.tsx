import { redirect } from 'next/navigation'
import DashboardContent from '@/features/dashboard/DashboardContent'
import PetModalShell from '@/features/pets/PetModalShell'
import { loadDashboard } from '@/server/dashboard/load-dashboard'

export default async function NewPetPage() {
  const data = await loadDashboard()
  if (!data) redirect('/login?next=/pets/new')

  return (
    <>
      <DashboardContent data={data} />
      <PetModalShell />
    </>
  )
}
