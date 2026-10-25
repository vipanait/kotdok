import Link from 'next/link'
import type { CheckCaseLink, SymptomCheckRecord } from '@lapka/contracts'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import { caseStatusLabel, followupHref, formatDayRange } from './followup-view'

/**
 * A case in the history (В-4): one row for its checks, with the latest
 * urgency, how it went, and how many checks and answers it holds; it opens
 * the case's timeline.
 */
export default function CaseHistoryRow({
  caseId,
  link,
  checks,
  checkins,
  dict,
  locale,
  timeZone,
}: {
  caseId: string
  link: CheckCaseLink
  /** The case's checks, newest first. */
  checks: SymptomCheckRecord[]
  checkins: number
  dict: Dictionary
  locale: Locale
  timeZone: string
}) {
  const words = dict.followup
  const latest = checks[0]!
  const first = checks.at(-1)!
  const dates = formatDayRange(first.created_at, latest.created_at, locale, timeZone)
  const counts = [formatCount(dict.history.count, checks.length, locale), formatCount(words.checkins, checkins, locale)].join(' · ')
  return (
    <Link href={followupHref.timeline(caseId)} className="history-row followup-history-row">
      <PetAvatar size={42} species={latest.pet_species} />
      <div className="copy">
        <strong>{latest.pet_name ? `${latest.pet_name} · ${dates}` : dates}</strong>
        <p className="followup-history-symptoms">{first.symptoms_input}</p>
        <p className="followup-history-meta">
          <UrgencyBadge urgency={latest.urgency} dict={dict} />
          <span>{caseStatusLabel(words, link)}</span>
          <span>{counts}</span>
        </p>
      </div>
      <Icon name="arrow" />
    </Link>
  )
}
