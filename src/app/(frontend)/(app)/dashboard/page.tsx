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

  const [{ data: profile }, { data: checks }, { data: cats }, { data: latestRequest }] = await Promise.all([
    service.from('profiles').select('credits, plan, role').eq('id', user.id).single(),
    service
      .from('symptom_checks')
      .select('id, symptoms_input, urgency, urgency_reason, possible_causes, cat_specific_warning, home_care_steps, vet_questions, full_response, created_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
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

  return (
    <AppShell right={
      <SignOutForm label={t.signOut} />
    }>
      <h1 className="sr-only">{t.title}</h1>

      {params.catSaved && (
        <div className="mb-6 rounded-2xl border border-status-good-fg/10 bg-status-good-bg px-4 py-3 text-sm font-semibold text-status-good-fg shadow-sm">
          {params.catSaved === 'created' ? t.catAdded : params.catSaved === 'deleted' ? t.catDeleted : t.catSaved}
        </div>
      )}

      {/* Credits + actions */}
      <section className="app-card mb-6 overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="app-kicker">{t.kicker}</p>
            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
              <span className="font-serif text-7xl sm:text-8xl font-semibold leading-none text-text">
                {credits}
              </span>
              <span className="max-w-32 text-sm text-text-muted sm:text-base">{t.checksUnit}</span>
            </div>
          </div>
          <DashboardActions cats={cats ?? []} />
        </div>

        {(credits === 0 || latestRequest?.status === 'pending') && (
          <ExtraCheckRequestPanel
            credits={credits}
            latestRequestStatus={(latestRequest?.status ?? null) as 'pending' | 'approved' | 'rejected' | null}
          />
        )}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {profile?.role === 'admin' ? (
            <Link
              href="/admin/statistics"
              className="app-button-secondary px-4 py-3 text-sm"
            >
              {t.statistics}
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
        </div>
      </section>

      {/* My cats */}
      <section className="app-card mb-6 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-text">{t.myCats}</h2>
          <Link href="/cats/new" className="app-link">{t.addCat}</Link>
        </div>
        {!cats?.length ? (
          <div className="app-card-soft px-4 py-5 text-sm text-text-muted">{t.noCats}</div>
        ) : (
          <ul className="grid gap-2">
            {cats.map((cat: { id: string; name: string; breed: string | null; age_years: number | null; sex: string | null }) => (
              <li key={cat.id} className="flex items-center justify-between rounded-2xl border border-hairline/70 bg-canvas/35 px-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CatAvatar size={40} />
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-text truncate">{cat.name}</div>
                    {(cat.breed || cat.age_years) && (
                      <div className="text-xs text-text-faint truncate">
                        {[cat.breed, cat.age_years ? `${cat.age_years} ${t.yearsOld}` : null].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
                <Link href={`/cats/${cat.id}/edit`} className="app-link shrink-0">{dict.common.edit}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Check history */}
      <section className="app-card p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-text">{t.checkHistory}</h2>
          {(checks?.length ?? 0) > 0 && (
            <Link href="/checks" className="app-link">{t.seeAll} →</Link>
          )}
        </div>
        <DashboardHistory checks={checks ?? []} />
      </section>

      <p className="text-center text-xs text-text-faint mt-6">
        <Link href="/legal" className="hover:underline">{t.tos}</Link>
      </p>
    </AppShell>
  )
}
