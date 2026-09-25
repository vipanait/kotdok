import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { isUrgencyKey, urgencyTitle } from '@/shared/utils/urgency'

/**
 * Pill with the urgency's name and its colour. Takes the dictionary rather
 * than reading context so server and client components can both use it.
 */
export default function UrgencyBadge({
  urgency,
  dict,
  className,
}: {
  urgency: string | null | undefined
  dict: Dictionary
  className?: string
}) {
  if (!isUrgencyKey(urgency)) return null
  return (
    <span className={`badge ${urgency}${className ? ` ${className}` : ''}`}>
      <i aria-hidden />
      {urgencyTitle(dict.urgency[urgency]?.label)}
    </span>
  )
}
