'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import type { CheckFollowup, Urgency } from '@lapka/contracts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { followupHref, formatDay, nextQuestionWhen, offerSentence, partOfCase } from './followup-view'
import { useBrowserClock } from './use-browser-clock'

/**
 * «Напомнить, как Мурка?» on a result (В-1).
 *
 * The switch writes to the server (`PUT /checks/{id}/followup`) and shows
 * what came back; a failed write puts it back where it was and says so. The
 * first look at an offer stores it with its default — on for a «watch»
 * level, off for one that sends to a vet, and off when switching on would
 * close the pet's other open case (the owner is told first). A re-check, or
 * a check too old for a new switch, shows the case it belongs to instead.
 */
export default function ReminderCard({
  checkId,
  petName,
  urgency,
  initial,
  timeZone,
}: {
  checkId: string
  petName: string
  urgency: Urgency
  initial: CheckFollowup
  timeZone?: string
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.followup
  const ids = useId()
  const now = useBrowserClock()
  const [followup, setFollowup] = useState(initial)
  /** The switch's position while a write is on its way; `null` when none is. */
  const [pending, setPending] = useState<boolean | null>(null)
  const [error, setError] = useState(false)
  const created = useRef(false)

  const offer = followup.offer
  const theCase = followup.case
  const enabled = pending ?? theCase?.status === 'active'

  async function write(next: boolean) {
    setPending(next)
    setError(false)
    try {
      setFollowup(await browserApi().setCheckFollowup(checkId, { enabled: next, via: 'web' }))
    } catch {
      setError(true)
    } finally {
      setPending(null)
    }
  }

  // An offer seen for the first time is stored with its default.
  useEffect(() => {
    if (created.current || !initial.offer || initial.case) return
    created.current = true
    void write(initial.offer.default_enabled && initial.offer.replaces === null)
    // Once per offer: `write` reads nothing that changes the decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!offer) {
    // No switch here: a re-check of a case, or a check older than twelve hours.
    if (!theCase || theCase.status === 'off') return null
    return (
      <section className="card followup-part" aria-label={words.openTimeline}>
        <Link href={followupHref.timeline(theCase.id)} className="link">
          {partOfCase(words, theCase, locale, timeZone)}
          <Icon name="arrow" />
        </Link>
      </section>
    )
  }

  const sentence = offerSentence(words, urgency)
  const dueAt = theCase?.status === 'active' && theCase.next_due_at ? theCase.next_due_at : offer.first_due_at
  const answered = (theCase?.checkin_count ?? 0) > 0
  const titleId = `${ids}-title`

  return (
    <section className="card followup-offer" aria-labelledby={titleId}>
      <div className="followup-offer-head">
        <h2 id={titleId}>{words.offerTitle.replace('{name}', () => petName)}</h2>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={enabled}
          aria-label={words.offerSwitch}
          aria-describedby={`${ids}-status`}
          aria-busy={pending !== null || undefined}
          onClick={() => {
            if (pending === null) void write(!enabled)
          }}
        >
          <span aria-hidden />
        </button>
      </div>
      {sentence && <p>{sentence}</p>}
      <p className="small followup-offer-web">{words.offerWeb}</p>

      {offer.replaces && !enabled && (
        <p className="banner followup-replaces">
          {words.offerReplaces
            .replace('{name}', () => petName)
            .replace('{date}', formatDay(offer.replaces.origin_checked_at, locale, timeZone))}
        </p>
      )}

      <div className="divider" />
      <p id={`${ids}-status`} className="small followup-offer-status" aria-live="polite">
        {pending !== null
          ? words.offerSaving
          : !enabled
            ? words.offerOff
            : now
              ? (answered ? words.offerNext : words.offerFirst).replace('{when}', nextQuestionWhen(dueAt, now, locale, words))
              : ' '}
      </p>
      {error && (
        <p className="banner error followup-error" role="alert">
          {words.offerFailed}
        </p>
      )}
      {theCase && theCase.status !== 'off' && answered && (
        <Link href={followupHref.timeline(theCase.id)} className="link followup-offer-link">
          {words.openTimeline}
          <Icon name="arrow" />
        </Link>
      )}
    </section>
  )
}
