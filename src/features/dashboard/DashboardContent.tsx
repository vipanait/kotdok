import Link from 'next/link'
import AppShell from '@/components/AppShell'
import DashboardActions from '@/features/dashboard/DashboardActions'
import DashboardHistory from '@/features/dashboard/DashboardHistory'
import ExtraCheckRequestPanel from '@/features/dashboard/ExtraCheckRequestPanel'
import MyPetsSection from '@/features/dashboard/MyPetsSection'
import SignOutForm from '@/features/auth/SignOutForm'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import type { DashboardData } from '@/server/dashboard/load-dashboard'

interface Props {
  data: DashboardData
  catSavedParam?: string
}

/**
 * Visual content of the dashboard. Used both by `/dashboard` and as a backdrop
 * behind cat-modal routes (`/cats/new`, `/cats/[id]/edit`).
 */
export default async function DashboardContent({ data, catSavedParam }: Props) {
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.dashboard

  const { credits, role, cats, checks, totalChecks, latestRequestStatus } = data
  const hasMoreChecks = totalChecks > checks.length
  const showRequestPanel = credits === 0 || latestRequestStatus === 'pending'

  return (
    <AppShell right={<SignOutForm label={t.signOut} />}>
      <h1 className="sr-only">{t.title}</h1>

      {catSavedParam && (
        <div className="mb-6 rounded-2xl border border-status-good-fg/10 bg-status-good-bg px-4 py-3 text-sm font-semibold text-status-good-fg shadow-sm">
          {catSavedParam === 'created' ? t.catAdded : catSavedParam === 'deleted' ? t.catDeleted : t.catSaved}
        </div>
      )}

      {/* My pets — interactive section with in-place add/edit modal */}
      <MyPetsSection cats={cats} />

      {/* Checks */}
      <section className="app-card mb-6 p-6 sm:p-7">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-text sm:text-2xl">{t.checkHistory}</h2>
          <span className="text-sm text-text-muted">{t.availableShort.replace('{n}', String(credits))}</span>
        </div>

        {showRequestPanel ? (
          <ExtraCheckRequestPanel
            credits={credits}
            latestRequestStatus={latestRequestStatus}
          />
        ) : (
          <DashboardActions cats={cats} />
        )}

        <div className="mt-8">
          <DashboardHistory
            checks={checks}
            emptyActionHref={cats.length > 0 ? '/check' : '/cats/new'}
            emptyActionLabel={cats.length > 0 ? t.startFirstCheck : t.addFirstCat}
          />
        </div>

        {hasMoreChecks && (
          <div className="mt-4 border-t border-hairline/70 pt-4 text-center">
            <Link href="/checks" className="app-link">{t.showAll}</Link>
          </div>
        )}
      </section>

      {role === 'admin' && (
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
