import { createClient, createServiceClient } from '@/server/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardActions from '@/features/dashboard/DashboardActions'
import DashboardHistory from '@/features/dashboard/DashboardHistory'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import AppShell from '@/components/AppShell'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.dashboard

  const service = createServiceClient()

  const [{ data: profile }, { data: checks }, { data: cats }] = await Promise.all([
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
  ])

  return (
    <AppShell right={
      <form action="/api/auth/signout" method="post">
        <button className="text-sm text-gray-500 hover:text-gray-700">{dict.common.signOut}</button>
      </form>
    }>
      <h1 className="sr-only">{t.title}</h1>

      {/* Credits */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">{t.availableChecks}</div>
            <div className="text-4xl font-bold text-gray-900">{profile?.credits ?? 0}</div>
          </div>
          <DashboardActions cats={cats ?? []} />
        </div>
        {(profile?.credits ?? 0) === 0 && (
          <div className="mt-4 text-sm text-orange-700 bg-orange-50 rounded-lg px-4 py-3">
            {t.creditsOut}{' '}
            <Link href="/pricing" className="underline font-medium">{t.topUp}</Link>
          </div>
        )}
        <div className="flex gap-3 mt-4">
          <Link
            href="/pricing"
            className="flex-1 bg-orange-500 text-white text-sm font-medium text-center px-4 py-2.5 rounded-xl hover:bg-orange-600 transition-colors"
          >
            {t.topUp}
          </Link>
          <Link
            href="/billing"
            className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-medium text-center px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            {t.transactionHistory}
          </Link>
        </div>
        {profile?.role === 'admin' && (
          <Link
            href="/admin/statistics"
            className="mt-3 block rounded-xl border border-orange-100 bg-orange-50 px-4 py-2.5 text-center text-sm font-medium text-orange-700 hover:bg-orange-100 transition-colors"
          >
            {dict.admin.statistics.title}
          </Link>
        )}
      </div>

      {/* My cats */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t.myCats}</h2>
          <Link href="/cats/new" className="text-sm text-orange-500 hover:text-orange-600 font-medium">{t.addCat}</Link>
        </div>
        {!cats?.length ? (
          <p className="text-sm text-gray-500">{t.noCats}</p>
        ) : (
          <ul className="space-y-2">
            {cats.map((cat: { id: string; name: string; breed: string | null; age_years: number | null; sex: string | null }) => (
              <li key={cat.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.sex === 'male' ? '🐱' : '🐈'}</span>
                  <div>
                    <span className="text-sm font-medium text-gray-800">{cat.name}</span>
                    {(cat.breed || cat.age_years) && (
                      <span className="text-xs text-gray-400 ml-2">
                        {[cat.breed, cat.age_years ? `${cat.age_years} ${t.yearsOld}` : null].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <Link href={`/cats/${cat.id}/edit`} className="text-xs text-gray-400 hover:text-gray-600">{dict.common.edit}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Check history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">{t.checkHistory}</h2>
        <DashboardHistory checks={checks ?? []} />
      </div>
      <p className="text-center text-xs text-gray-400 mt-6">
        <Link href="/legal" className="hover:underline">{t.tos}</Link>
      </p>
    </AppShell>
  )
}
