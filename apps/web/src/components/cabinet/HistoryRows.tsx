import Link from 'next/link'
import type { SymptomCheckRecord } from '@lapka/contracts'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/**
 * Rows of past checks: what was described, whose pet and when, the urgency,
 * and a link to the saved result. Used by the overview and by the history.
 */
export default function HistoryRows({
  checks,
  dict,
  locale,
}: {
  checks: SymptomCheckRecord[]
  dict: Dictionary
  locale: Locale
}) {
  const dateFormat = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div>
      {checks.map(check => {
        const when = dateFormat.format(new Date(check.created_at))
        return (
          <Link key={check.id} href={`/check/${check.id}`} className="history-row">
            <PetAvatar size={42} species={check.pet_species} />
            <div className="copy">
              <strong>{check.symptoms_input}</strong>
              <p>{check.pet_name ? `${check.pet_name} · ${when}` : when}</p>
            </div>
            <UrgencyBadge urgency={check.urgency} dict={dict} />
            <Icon name="arrow" />
          </Link>
        )
      })}
    </div>
  )
}
