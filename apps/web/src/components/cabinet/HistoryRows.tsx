import Link from 'next/link'
import type { SymptomCheckRecord } from '@lapka/contracts'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import { intlLocale, type Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/**
 * Rows of past checks: what was described, whose pet and when, the urgency,
 * and a link to the saved result. Used by the overview and by the history.
 */
export default function HistoryRows({
  checks,
  dict,
  locale,
  timeZone,
}: {
  checks: SymptomCheckRecord[]
  dict: Dictionary
  locale: Locale
  timeZone: string
}) {
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
  // "23 сентября, 12:40" — the same shape as on the result page, without "в".
  const formatWhen = (iso: string) => {
    const parts = dateFormat.formatToParts(new Date(iso))
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
    const time = `${get('hour')}:${get('minute')}${get('dayPeriod') ? ` ${get('dayPeriod')}` : ''}`
    return locale === 'ru' ? `${get('day')} ${get('month')}, ${time}` : `${get('month')} ${get('day')}, ${time}`
  }

  return (
    <div>
      {checks.map(check => {
        const when = formatWhen(check.created_at)
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
