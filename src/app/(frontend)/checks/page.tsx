import type { Metadata } from 'next'
import { createClient, createServiceClient } from '@/server/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import AppShell from '@/components/AppShell'
import DashboardHistory from '@/features/dashboard/DashboardHistory'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function ChecksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/checks')

  const locale = await getLocale()
  const dict = await getDictionary(locale)

  const service = createServiceClient()
  const { data: checks } = await service
    .from('symptom_checks')
    .select('id, symptoms_input, urgency, urgency_reason, possible_causes, species_specific_warning, home_care_steps, vet_questions, full_response, created_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <AppShell right={
      <Link href="/dashboard" className="app-link">{dict.common.back}</Link>
    }>
      <section className="app-card p-6 sm:p-8">
        <div className="app-section-header">
          <div>
            <h1 className="app-section-title">{dict.dashboard.checkHistory}</h1>
            <p className="app-section-description">{dict.dashboard.checkHistorySubtitle}</p>
          </div>
        </div>
        <DashboardHistory
          checks={checks ?? []}
          emptyActionHref="/dashboard"
          emptyActionLabel={dict.common.backToAccount}
        />
      </section>
    </AppShell>
  )
}
