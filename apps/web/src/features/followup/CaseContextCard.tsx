import Link from 'next/link'
import type { FollowupCaseSummary } from '@lapka/contracts'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatDayTime } from './followup-view'

/**
 * The case beside a page about it: the pet, when watching began, the latest
 * urgency and what was described, and the way back to the first check. No
 * hooks, so server pages and client screens both draw it.
 */
export default function CaseContextCard({
  item,
  petLine,
  dict,
  locale,
  timeZone,
  headingLevel = 2,
}: {
  item: Pick<FollowupCaseSummary, 'pet_name' | 'pet_species' | 'origin_checked_at' | 'origin_check_id' | 'current_urgency' | 'symptoms'>
  /** «Кошка · Сибирская · 6 лет», when the pet's profile is known. */
  petLine: string
  dict: Dictionary
  locale: Locale
  timeZone?: string
  headingLevel?: 2 | 3
}) {
  const words = dict.followup
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section className="card soft followup-context" aria-label={item.pet_name}>
      <div className="row">
        <PetAvatar species={item.pet_species} size={64} />
        <div className="followup-context-pet">
          <Heading>{item.pet_name}</Heading>
          {petLine && <p className="small">{petLine}</p>}
        </div>
      </div>
      <div className="divider" />
      <p className="small">{words.startedAt}</p>
      <p className="followup-context-start">{formatDayTime(item.origin_checked_at, locale, timeZone)}</p>
      <UrgencyBadge urgency={item.current_urgency} dict={dict} />
      {item.symptoms && <p className="followup-context-symptoms">{item.symptoms}</p>}
      <Link href={`/check/${item.origin_check_id}`} className="link">
        {words.openCheck}
        <Icon name="arrow" />
      </Link>
    </section>
  )
}
