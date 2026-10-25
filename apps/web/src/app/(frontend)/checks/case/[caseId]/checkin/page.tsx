import { UuidSchema } from '@lapka/contracts'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import CaseNotFound from '@/features/followup/CaseNotFound'
import CheckinScreen from '@/features/followup/CheckinScreen'
import { checkinSource, followupHref, parseAnswer, petLineOf } from '@/features/followup/followup-view'
import { loadFollowupCasePage } from '@/server/checks/load-followup-pages'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getTimeZone } from '@/server/i18n/get-time-zone'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { petSummary } from '@/shared/utils/pet-summary'

export const generateMetadata = privatePageMetadata(d => d.followup.checkinFormLabel)

/**
 * «Как Мурка сейчас?» (FU-02, В-3): its own address, so a banner, a link from
 * the timeline or a bookmark opens it, and a reload keeps it. Signed in only;
 * someone else's case, or one whose pet or check is gone, is «not found».
 * `?answer=` preselects an answer from the overview — nothing is saved until
 * the owner sends it; `?from=` is where they came from.
 */
export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ caseId }, query] = await Promise.all([params, searchParams])
  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(followupHref.checkin(caseId))}`)
  const [locale, timeZone] = await Promise.all([getLocale(), getTimeZone()])
  const dict = await getDictionary(locale)

  const page = UuidSchema.safeParse(caseId).success ? await loadFollowupCasePage(cabinet.user.id, caseId) : null

  return (
    <CabinetShell cabinet={cabinet} active="history" crumb={dict.followup.crumb}>
      {page ? (
        <CheckinScreen
          // A new form for each case: its own answer and its own idempotency key.
          key={page.case.id}
          item={page.case}
          petLine={petLineOf(page.case.pet_species, page.pet ? petSummary(page.pet, dict, locale) : '', dict)}
          latestCheckId={page.case.checks.at(-1)?.check_id ?? page.case.origin_check_id}
          latestCheckAt={page.case.checks.at(-1)?.created_at ?? page.case.origin_checked_at}
          homeCareSteps={page.latest?.home_care_steps ?? []}
          credits={cabinet.credits}
          initialAnswer={parseAnswer(query.answer)}
          source={checkinSource(query.from)}
          timeZone={timeZone}
        />
      ) : (
        <CaseNotFound dict={dict} />
      )}
    </CabinetShell>
  )
}
