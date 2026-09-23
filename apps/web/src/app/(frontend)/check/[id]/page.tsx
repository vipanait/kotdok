import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import CheckResultContent from '@/features/symptom-check/CheckResultContent'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { loadCheckResult } from '@/server/checks/load-check-pages'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getTimeZone } from '@/server/i18n/get-time-zone'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.check.resultTitle)

export default async function CheckResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(`/check/${id}`)}`)

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
