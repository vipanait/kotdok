'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { nextQuestionWhen } from './followup-view'
import { useBrowserClock } from './use-browser-clock'

/**
 * A sentence with the next question's time in it, moved out of the night on
 * the browser's clock. Empty on the server: the zone there is not the owner's.
 */
export default function NextQuestionLine({
  dueAt,
  template,
  className,
}: {
  dueAt: string
  template: 'noCheckinsYet' | 'offerNext' | 'askAgain'
  className?: string
}) {
  const words = useTranslations().followup
  const locale = useLocale()
  const now = useBrowserClock()
  if (!now) return null
  return <p className={className}>{words[template].replace('{when}', nextQuestionWhen(dueAt, now, locale, words))}</p>
}
