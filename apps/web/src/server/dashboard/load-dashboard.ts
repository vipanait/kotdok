import { createClient, createServiceClient } from '@/server/supabase/server'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Pet, PetLatestCheck } from '@/shared/types'
import type { SymptomCheckRecord } from '@/features/symptom-check/CheckResultContent'
import { mapSymptomCheckRow, symptomCheckSelect } from '@/server/symptom-check/map-symptom-check'

export type { PetLatestCheck }

export interface DashboardData {
  user: User
  credits: number
  role: 'admin' | string | null
  pets: Pet[]
  checks: SymptomCheckRecord[]
  totalChecks: number
  latestRequestStatus: 'pending' | 'approved' | 'rejected' | null
  latestChecksByPet: Record<string, PetLatestCheck>
}

const HISTORY_LIMIT = 4

/**
 * Loads everything the dashboard page renders. Reused by `/dashboard` and by
 * any route that puts a modal on top of the dashboard (pet add/edit, etc.) so
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

  const [
    { data: profile },
    { data: checks, count: totalChecks },
    { data: pets },
    { data: latestRequest },
    { data: recentPetChecks },
  ] =
    await Promise.all([
      service.from('profiles').select('credits, plan, role').eq('id', user.id).single(),
      service
        .from('symptom_checks')
        .select(symptomCheckSelect(), { count: 'exact' })
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
      service
        .from('pets')
        .select('*')
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
      service
        .from('symptom_checks')
        .select('pet_id, urgency, created_at')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .not('pet_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  const latestChecksByPet: Record<string, PetLatestCheck> = {}
  for (const row of recentPetChecks ?? []) {
    const petId = row.pet_id as string | null
    if (!petId || latestChecksByPet[petId]) continue
    latestChecksByPet[petId] = {
      urgency: row.urgency as string,
      created_at: row.created_at as string,
    }
  }

  return {
    user,
    credits: profile?.credits ?? 0,
    role: (profile?.role as string | null) ?? null,
    pets: (pets ?? []) as DashboardData['pets'],
    checks: (checks ?? []).map(row => mapSymptomCheckRow(row as never)),
    totalChecks: totalChecks ?? 0,
    latestRequestStatus: (latestRequest?.status ?? null) as DashboardData['latestRequestStatus'],
    latestChecksByPet,
  }
}
