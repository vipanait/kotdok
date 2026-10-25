import Link from 'next/link'
import type { SymptomCheckRecord } from '@lapka/contracts'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import { intlLocale, type Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/** "23 сентября, 12:40" — the same shape as on the result page, without "в". */
export function historyWhen(locale: Locale, timeZone: string): (iso: string) => string {
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
  return (iso: string) => {
    const parts = dateFormat.formatToParts(new Date(iso))
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
    const time = `${get('hour')}:${get('minute')}${get('dayPeriod') ? ` ${get('dayPeriod')}` : ''}`
    return locale === 'ru' ? `${get('day')} ${get('month')}, ${time}` : `${get('month')} ${get('day')}, ${time}`
  }
}

/** One past check: what was described, whose pet and when, the urgency, a link to the result. */
export function HistoryRow({
  check,
  dict,
  formatWhen,
}: {
  check: SymptomCheckRecord
  dict: Dictionary
  formatWhen: (iso: string) => string
}) {
  const when = formatWhen(check.created_at)
  return (
    <Link href={`/check/${check.id}`} className="history-row">
      <PetAvatar size={42} species={check.pet_species} />
      <div className="copy">
        <strong>{check.symptoms_input}</strong>
        <p>{check.pet_name ? `${check.pet_name} · ${when}` : when}</p>
      </div>
      <UrgencyBadge urgency={check.urgency} dict={dict} />
      <Icon name="arrow" />
    </Link>
  )
}

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
  const formatWhen = historyWhen(locale, timeZone)
  return (
    <div>
      {checks.map(check => <HistoryRow key={check.id} check={check} dict={dict} formatWhen={formatWhen} />)}
    </div>
  )
}
