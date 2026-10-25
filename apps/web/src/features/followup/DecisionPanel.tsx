'use client'

import type { RefObject } from 'react'
import Link from 'next/link'
import type { FollowupCaseSummary, FollowupDecision } from '@lapka/contracts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { clinicSearchUrl } from '@/features/symptom-check/clinic-search'
import RecordSaveButton from './RecordSaveButton'
import { decisionTone, followupHref, nextQuestionWhen, sinceCheck, visitFormHref } from './followup-view'
import { useBrowserClock } from './use-browser-clock'

/**
 * What the fixed rule said about an answer (В-3, «итог»): the decision is the
 * server's, this panel only gives its words and the actions that go with it.
 *
 * - `close_improved` — closed; offers «Записать в медкарту».
 * - `keep_watching` — the next question's time and the home care of the
 *   latest check.
 * - `see_vet`, `see_vet_today`, `clinic_now` — the clinic first, then the
 *   visit, then a paid re-check with the previous one in mind; with no
 *   checks left the existing request for more instead.
 * - `vet_seen` — closed; the visit form, linked to the case's latest check.
 */
export default function DecisionPanel({
  decision,
  item,
  latestCheckId,
  latestCheckAt,
  homeCareSteps,
  credits,
  headingRef,
}: {
  decision: FollowupDecision
  /** The case as it is after the answer. */
  item: FollowupCaseSummary
  latestCheckId: string
  /** When that check was made: «прошло 2 дня» counts from it. */
  latestCheckAt: string
  homeCareSteps: string[]
  credits: number
  headingRef?: RefObject<HTMLHeadingElement | null>
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.followup
  const now = useBrowserClock()
  const tone = decisionTone(decision)
  const nextWhen = item.status === 'active' && item.next_due_at && now ? nextQuestionWhen(item.next_due_at, now, locale, words) : null

  const heading = (text: string) => (
    <h2 ref={headingRef} tabIndex={-1}>
      {text}
    </h2>
  )

  if (tone === 'vet') {
    const title =
      decision === 'clinic_now' ? words.clinicNowTitle : decision === 'see_vet_today' ? words.seeVetTodayTitle : words.seeVetTitle
    const body =
      decision === 'clinic_now'
        ? dict.urgency.emergency.action
        : decision === 'see_vet_today'
          ? words.seeVetTodayBody
          : now
            ? words.seeVetBody.replace('{period}', sinceCheck(latestCheckAt, now, words, locale))
            : null
    return (
      <section className="card followup-outcome is-vet" aria-live="polite">
        {heading(title)}
        {body && <p>{body}</p>}
        {nextWhen && <p className="small">{words.askAgain.replace('{when}', nextWhen)}</p>}
        <div className="followup-outcome-actions">
          <a href={clinicSearchUrl(dict.check.clinicSearchQuery)} target="_blank" rel="noopener noreferrer" className="btn primary btn-block">
            {dict.check.findClinic}
            <Icon name="arrow" />
          </a>
          <Link href={visitFormHref(item.pet_id, latestCheckId)} className="btn secondary btn-block">
            {words.recordVisit}
          </Link>
        </div>
        {credits > 0 ? (
          <div className="followup-recheck">
            <Link href={followupHref.recheck(item.pet_id, item.id)} className="link">
              {words.recheck}
            </Link>
            <p className="small">{words.recheckPrice.replace('{n}', String(credits))}</p>
          </div>
        ) : (
          <div className="followup-recheck">
            <p className="small">{words.noCredits}</p>
            <Link href="/credits" className="link">
              {words.requestMore}
              <Icon name="arrow" />
            </Link>
          </div>
        )}
      </section>
    )
  }

  if (decision === 'keep_watching') {
    return (
      <section className="card followup-outcome" aria-live="polite">
        <span className="followup-outcome-mark" aria-hidden>✓</span>
        {heading(words.keepTitle)}
        {nextWhen && <p>{words.offerNext.replace('{when}', nextWhen)}</p>}
        {homeCareSteps.length > 0 && (
          <details className="disclosure followup-homecare">
            <summary>{words.homeCare}</summary>
            <ol>
              {homeCareSteps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </details>
        )}
        <Link href="/dashboard" className="btn primary btn-block">
          {words.ok}
        </Link>
      </section>
    )
  }

  if (decision === 'vet_seen') {
    return (
      <section className="card followup-outcome" aria-live="polite">
        <span className="followup-outcome-mark" aria-hidden>✓</span>
        {heading(words.vetSeenTitle)}
        <p>{words.vetSeenBody}</p>
        <Link href={visitFormHref(item.pet_id, latestCheckId)} className="btn primary btn-block">
          {words.recordVisit}
        </Link>
        <Link href={followupHref.timeline(item.id)} className="link">
          {words.later}
        </Link>
      </section>
    )
  }

  // close_improved
  return (
    <section className="card followup-outcome" aria-live="polite">
      <span className="followup-outcome-mark" aria-hidden>✓</span>
      {heading(words.improvedTitle)}
      <p>{words.improvedBody}</p>
      <RecordSaveButton caseId={item.id} saved={item.saved_to_record_at !== null} />
      <p className="small">{words.recordNote}</p>
      <Link href={followupHref.timeline(item.id)} className="link">
        {words.recordSkip}
      </Link>
    </section>
  )
}
