import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import CheckResultContent from '@/features/symptom-check/CheckResultContent'
import { loadCabinetUser } from '@/server/cabinet/load-cabinet'
import { loadCheckResult } from '@/server/checks/load-check-pages'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getTimeZone } from '@/server/i18n/get-time-zone'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function CheckResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const cabinet = await loadCabinetUser()
  if (!cabinet) redirect(`/login?next=${encodeURIComponent(`/check/${id}`)}`)

  // Only the owner's own, not deleted, result; anything else is a 404.
  const loaded = await loadCheckResult(cabinet.user.id, id)
  if (!loaded) notFound()

  const [locale, timeZone] = await Promise.all([getLocale(), getTimeZone()])
  const dict = await getDictionary(locale)

  return (
    <CabinetShell cabinet={cabinet} active="history" crumb={dict.check.resultCrumb}>
      <CheckResultContent check={loaded.check} pet={loaded.pet} dict={dict} locale={locale} timeZone={timeZone} />
    </CabinetShell>
  )
}
