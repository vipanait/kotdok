import { createClient, createServiceClient } from '@/server/supabase/server'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

export interface DashboardData {
  user: User
  credits: number
  role: 'admin' | string | null
  cats: Array<{ id: string; name: string; breed: string | null; age_years: number | null; sex: 'male' | 'female' | null }>
  checks: Array<{
    id: string
    symptoms_input: string
    urgency: string
    urgency_reason: string
    possible_causes: unknown
    cat_specific_warning: string | null
    home_care_steps: unknown
    vet_questions: unknown
    full_response: Record<string, unknown> | null
    created_at: string
  }>
  totalChecks: number
  latestRequestStatus: 'pending' | 'approved' | 'rejected' | null
}

const HISTORY_LIMIT = 4

/**
 * Loads everything the dashboard page renders. Reused by `/dashboard` and by
 * any route that puts a modal on top of the dashboard (cat add/edit, etc.) so
 * we don't duplicate fetch logic.
 *
 * Performs the auth check itself: redirects to `/login` if the visitor isn't
 * signed in.
 */
export async function loadDashboard(loginRedirectPath = '/login'): Promise<DashboardData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(loginRedirectPath)

  const service = createServiceClient()

  const [{ data: profile }, { data: checks, count: totalChecks }, { data: cats }, { data: latestRequest }] =
    await Promise.all([
      service.from('profiles').select('credits, plan, role').eq('id', user.id).single(),
      service
        .from('symptom_checks')
        .select(
          'id, symptoms_input, urgency, urgency_reason, possible_causes, cat_specific_warning, home_care_steps, vet_questions, full_response, created_at',
          { count: 'exact' },
        )
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
      service
        .from('cats')
        .select('id, name, breed, age_years, sex')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      service
        .from('extra_check_requests')
        .select('status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  return {
    user,
    credits: profile?.credits ?? 0,
    role: (profile?.role as string | null) ?? null,
    cats: (cats ?? []) as DashboardData['cats'],
    checks: (checks ?? []) as DashboardData['checks'],
    totalChecks: totalChecks ?? 0,
    latestRequestStatus: (latestRequest?.status ?? null) as DashboardData['latestRequestStatus'],
  }
}
