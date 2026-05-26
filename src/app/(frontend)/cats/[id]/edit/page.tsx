import type { Metadata } from 'next'
import { createServiceClient } from '@/server/supabase/server'
import { notFound } from 'next/navigation'
import DashboardContent from '@/features/dashboard/DashboardContent'
import CatModalShell from '@/features/cats/CatModalShell'
import { loadDashboard } from '@/server/dashboard/load-dashboard'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function EditCatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const data = await loadDashboard()

  const service = createServiceClient()
  const { data: cat } = await service
    .from('cats')
    .select('*')
    .eq('id', id)
    .eq('user_id', data.user.id)
    .is('deleted_at', null)
    .single()

  if (!cat) notFound()

  return (
    <>
      <DashboardContent data={data} />
      <CatModalShell cat={cat} />
    </>
  )
}
