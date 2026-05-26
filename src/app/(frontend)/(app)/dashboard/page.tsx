import { createClient, createServiceClient } from '@/server/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardActions from '@/features/dashboard/DashboardActions'
import DashboardHistory from '@/features/dashboard/DashboardHistory'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import AppShell from '@/components/AppShell'
import CatAvatar from '@/components/CatAvatar'
import ExtraCheckRequestPanel from '@/features/dashboard/ExtraCheckRequestPanel'
import SignOutForm from '@/features/auth/SignOutForm'

const HISTORY_LIMIT = 4

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ catSaved?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.dashboard
  const params = await searchParams

  const service = createServiceClient()

  const [{ data: profile }, { data: checks, count: totalChecks }, { data: cats }, { data: latestRequest }] = await Promise.all([
    service.from('profiles').select('credits, plan, role').eq('id', user.id).single(),
    service
      .from('symptom_checks')
      .select('id, symptoms_input, urgency, urgency_reason, possible_causes, cat_specific_warning, home_care_steps, vet_questions, full_response, created_at', { count: 'exact' })
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

  const credits = profile?.credits ?? 0
  const hasMoreChecks = (totalChecks ?? 0) > (checks?.length ?? 0)
  const showRequestPanel = credits === 0 || latestRequest?.status === 'pending'

  return (
    <AppShell right={<SignOutForm label={t.signOut} />}>
      <h1 className="sr-only">{t.title}</h1>

      {params.catSaved && (
        <div className="mb-6 rounded-2xl border border-status-good-fg/10 bg-status-good-bg px-4 py-3 text-sm font-semibold text-status-good-fg shadow-sm">
          {params.catSaved === 'created' ? t.catAdded : params.catSaved === 'deleted' ? t.catDeleted : t.catSaved}
        </div>
      )}

      {/* My pets */}
      <section className="app-card mb-6 p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-text sm:text-2xl">{t.myCats}</h2>
          <Link href="/cats/new" className="app-link shrink-0">{t.addCat}</Link>
        </div>
        {!cats?.length ? (
          <div className="app-empty-state">
            <h3 className="text-base font-bold text-text">{t.catsEmptyTitle}</h3>
            <p className="mt-1 text-sm leading-relaxed">{t.noCats}</p>
            <Link href="/cats/new" className="app-button-secondary app-button-sm mt-4">
              {t.addFirstCat}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-1">
            {cats.map((cat: { id: string; name: string; breed: string | null; age_years: number | null; sex: string | null }) => (
              <li key={cat.id}>
                <Link
                  href={`/cats/${cat.id}/edit`}
                  className="flex items-center justify-between gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-canvas-soft/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CatAvatar size={48} />
                    <div className="min-w-0">
                      <div className="text-base font-bold text-text truncate">{cat.name}</div>
                      {(cat.breed || cat.age_years) && (
                        <div className="text-sm text-text-faint truncate">
                          {[cat.breed, cat.age_years ? `${cat.age_years} ${t.yearsOld}` : null].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Checks */}
      <section className="app-card mb-6 p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-text sm:text-2xl">{t.checkHistory}</h2>
          <span className="text-sm text-text-muted">{t.availableShort.replace('{n}', String(credits))}</span>
        </div>

        {showRequestPanel ? (
          <ExtraCheckRequestPanel
            credits={credits}
            latestRequestStatus={(latestRequest?.status ?? null) as 'pending' | 'approved' | 'rejected' | null}
          />
        ) : (
          <DashboardActions cats={cats ?? []} />
        )}

        <div className="mt-5">
          <DashboardHistory
            checks={checks ?? []}
            emptyActionHref={(cats?.length ?? 0) > 0 ? '/check' : '/cats/new'}
            emptyActionLabel={(cats?.length ?? 0) > 0 ? t.startFirstCheck : t.addFirstCat}
          />
        </div>

        {hasMoreChecks && (
          <div className="mt-4 border-t border-hairline/70 pt-4 text-center">
            <Link href="/checks" className="app-link">{t.showAll}</Link>
          </div>
        )}
      </section>

      {profile?.role === 'admin' && (
        <section className="mb-6 flex justify-center">
          <Link href="/admin/statistics" className="app-button-secondary app-button-sm">
            {t.statistics}
          </Link>
        </section>
      )}

      <p className="text-center text-xs text-text-faint mt-6">
        <Link href="/legal" className="hover:underline">{t.tos}</Link>
      </p>
    </AppShell>
  )
}
