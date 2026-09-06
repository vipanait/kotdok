import type { Metadata } from 'next'
import { createServiceClient } from '@/server/supabase/server'
import { notFound, redirect } from 'next/navigation'
import DashboardContent from '@/features/dashboard/DashboardContent'
import PetModalShell from '@/features/pets/PetModalShell'
import { loadDashboard } from '@/server/dashboard/load-dashboard'
import type { Pet } from '@/shared/types'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function EditPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const data = await loadDashboard()
  if (!data) redirect('/login')

  const service = createServiceClient()
  const { data: pet } = await service
    .from('pets')
    .select('*')
    .eq('id', id)
    .eq('user_id', data.user.id)
    .is('deleted_at', null)
    .single()

  if (!pet) notFound()

  return (
    <>
      <DashboardContent data={data} />
      <PetModalShell pet={pet as Pet} />
    </>
  )
}
