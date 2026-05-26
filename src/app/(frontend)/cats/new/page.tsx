import type { Metadata } from 'next'
import DashboardContent from '@/features/dashboard/DashboardContent'
import CatModalShell from '@/features/cats/CatModalShell'
import { loadDashboard } from '@/server/dashboard/load-dashboard'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function NewCatPage() {
  const data = await loadDashboard('/login?next=/cats/new')
  return (
    <>
      <DashboardContent data={data} />
      <CatModalShell />
    </>
  )
}
