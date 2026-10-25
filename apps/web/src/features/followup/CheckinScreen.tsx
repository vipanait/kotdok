'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FOLLOWUP_NOTE_MAX,
  FOLLOWUP_STATES,
  type FollowupCaseSummary,
  type FollowupCheckinResult,
  type FollowupSource,
  type FollowupState,
} from '@lapka/contracts'
import { ApiError, followupAsksVet } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import { browserApi } from '@/features/api/browser-api'
import CaseContextCard from './CaseContextCard'
import DecisionPanel from './DecisionPanel'
import MoodArt from './MoodArt'
import { answerLabel, caseStatusLabel, followupHref, formatDay, formatDayTime } from './followup-view'

type Phase =
  | { kind: 'form' }
  | { kind: 'done'; result: FollowupCheckinResult }
  | { kind: 'closed'; item: FollowupCaseSummary }
  | { kind: 'gone' }

/** A new key per form: a retry of the same form is the same answer on the server. */
function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-web`
}

/**
 * «Как Мурка сейчас?» (В-3): the answer on the left, what happens next on
 * the right — below the form on a narrow screen, where focus moves to it.
 *
 * The answer is one choice, the note optional; a case that asks about the
 * vet needs both answers. The Idempotency-Key is made once for this form, so
 * a double press or a retry after a lost response is one answer. The outcome
 * is the server's decision; nothing shows as saved before the server said so,
 * and a failed send keeps everything typed.
 */
export default function CheckinScreen({
  item,
  petLine,
  latestCheckId,
  latestCheckAt,
  homeCareSteps,
  credits,
  initialAnswer,
  source,
  timeZone,
}: {
  item: FollowupCaseSummary
  petLine: string
  /** The case's latest check: the visit form links to it. */
  latestCheckId: string
  latestCheckAt: string
  /** That check's home care steps, for «Наблюдаем дальше». */
  homeCareSteps: string[]
  credits: number
  initialAnswer: FollowupState | null
  source: FollowupSource
  timeZone: string
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.followup
  const router = useRouter()
  const ids = useId()

  const [phase, setPhase] = useState<Phase>(item.status === 'closed' ? { kind: 'closed', item } : { kind: 'form' })
  const [state, setState] = useState<FollowupState | null>(initialAnswer)
  const [vetVisited, setVetVisited] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<{ vet: boolean; state: boolean }>({ vet: false, state: false })
  const [key] = useState(newKey)
  const inFlight = useRef(false)
  const outcomeHeading = useRef<HTMLHeadingElement>(null)
  const closedHeading = useRef<HTMLHeadingElement>(null)

  const asksVet = followupAsksVet(item.next_slot)

  useEffect(() => {
    if (phase.kind === 'done') outcomeHeading.current?.focus()
    if (phase.kind === 'closed' || phase.kind === 'gone') closedHeading.current?.focus()
  }, [phase.kind])

  async function submit() {
    if (inFlight.current) return
    const lack = { vet: asksVet && vetVisited === null, state: state === null }
    setMissing(lack)
    if (lack.vet || lack.state || !state) return

    inFlight.current = true
    setSending(true)
    setError(null)
    const trimmed = note.trim()
    try {
      const result = await browserApi().sendFollowupCheckin(item.id, key, {
        state,
        ...(asksVet ? { vet_visited: vetVisited === true } : {}),
        ...(trimmed ? { note: trimmed.slice(0, FOLLOWUP_NOTE_MAX) } : {}),
        source,
      })
      setPhase({ kind: 'done', result })
      // The overview's banner and the history read the case again.
      router.refresh()
    } catch (failure) {
      inFlight.current = false
      if (failure instanceof ApiError) {
        if (failure.status === 401) {
          router.push(`/login?next=${encodeURIComponent(followupHref.checkin(item.id))}`)
          return
        }
        if (failure.code === 'conflict') {
          // Closed meanwhile — on another device, or by an answer already given.
          setPhase({ kind: 'closed', item })
          router.refresh()
          return
        }
        if (failure.code === 'not_found') {
          setPhase({ kind: 'gone' })
          return
        }
        setError(failure.code === 'rate_limited' ? words.tooMany : words.sendFailed)
      } else {
        setError(words.sendFailed)
      }
    } finally {
      setSending(false)
    }
  }

  if (phase.kind === 'gone') {
    return (
      <section className="card followup-problem" aria-labelledby={`${ids}-gone`}>
        <h1 id={`${ids}-gone`} ref={closedHeading} tabIndex={-1}>{words.notFoundTitle}</h1>
        <p>{words.notFoundBody}</p>
        <Link href="/pets" className="btn primary">{words.toPets}</Link>
      </section>
    )
  }

  if (phase.kind === 'closed') {
    const closedAt = phase.item.closed_at
    return (
      <>
        <div className="pagehead">
          <div>
            <h1 ref={closedHeading} tabIndex={-1}>{words.closedTitle}</h1>
            <p>
              {[item.pet_name, closedAt ? formatDay(closedAt, locale, timeZone) : null, phase.item.outcome ? caseStatusLabel(words, phase.item) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <section className="card followup-closed">
          <p>{words.closedBody}</p>
          <Link href={followupHref.timeline(item.id)} className="btn primary">
            {words.toTimeline}
          </Link>
        </section>
      </>
    )
  }

  if (phase.kind === 'done') {
    const { checkin, case: after } = phase.result
    return (
      <>
        <div className="pagehead">
          <div>
            <h1>{words.savedTitle}</h1>
            <p>{`${item.pet_name} · ${formatDayTime(checkin.created_at, locale, timeZone)}`}</p>
          </div>
          <Link href={followupHref.timeline(item.id)} className="link">
            {words.toTimeline}
            <Icon name="arrow" />
          </Link>
        </div>
        <div className="care-columns followup-columns">
          <div>
            <section className="card followup-answer" aria-labelledby={`${ids}-answer`}>
              <p className="eyebrow">{words.yourAnswer}</p>
              <h2 id={`${ids}-answer`}>{answerLabel(words, checkin)}</h2>
              <p className="followup-answer-note">{checkin.note ?? words.answerAdded}</p>
              <Link href={followupHref.timeline(item.id)} className="link">
                {words.viewTimeline}
                <Icon name="arrow" />
              </Link>
            </section>
          </div>
          <aside>
            <DecisionPanel
              decision={checkin.decision}
              item={after}
              latestCheckId={latestCheckId}
              latestCheckAt={latestCheckAt}
              homeCareSteps={homeCareSteps}
              credits={credits}
              headingRef={outcomeHeading}
            />
          </aside>
        </div>
      </>
    )
  }

  const noteId = `${ids}-note`
  const errorId = `${ids}-error`
  const stateLegend = words.checkinTitle.replace('{name}', () => item.pet_name)

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{stateLegend}</h1>
          <p>{words.checkinSubtitle.replace('{date}', formatDay(item.origin_checked_at, locale, timeZone))}</p>
        </div>
        <Link href={followupHref.timeline(item.id)} className="link">
          <Icon name="back" />
          {words.toTimeline}
        </Link>
      </div>

      <div className="care-columns followup-columns">
        <div>
          <form
            className="card followup-form"
            aria-label={words.checkinFormLabel}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <UrgencyBadge urgency={item.current_urgency} dict={dict} />
            {item.symptoms && <p className="small followup-form-symptoms">{item.symptoms}</p>}

            {asksVet && (
              <fieldset className="followup-vet" aria-describedby={missing.vet ? `${ids}-vet-error` : undefined}>
                <legend>{words.vetQuestion}</legend>
                <div className="chips">
                  {([true, false] as const).map((value) => (
                    <label key={String(value)} className="chip followup-chip" data-checked={vetVisited === value || undefined}>
                      <input
                        type="radio"
                        name={`${ids}-vet`}
                        className="sr-only"
                        checked={vetVisited === value}
                        onChange={() => {
                          setVetVisited(value)
                          setMissing((prev) => ({ ...prev, vet: false }))
                        }}
                      />
                      {value ? words.vetYes : words.vetNo}
                    </label>
                  ))}
                </div>
                {missing.vet && <p id={`${ids}-vet-error`} className="field-error">{words.vetRequired}</p>}
              </fieldset>
            )}

            <fieldset className="followup-moods" aria-describedby={missing.state ? `${ids}-state-error` : undefined}>
              {/* The page's heading asks the question; asked twice only with the vet question above it. */}
              <legend className={asksVet ? 'followup-moods-legend' : 'sr-only'}>{stateLegend}</legend>
              {FOLLOWUP_STATES.map((value) => (
                <label key={value} className="followup-mood" data-checked={state === value || undefined}>
                  <input
                    type="radio"
                    className="sr-only"
                    name={`${ids}-state`}
                    value={value}
                    checked={state === value}
                    onChange={() => {
                      setState(value)
                      setMissing((prev) => ({ ...prev, state: false }))
                    }}
                  />
                  <MoodArt species={item.pet_species} state={value} size={78} />
                  <span className="followup-mood-text">
                    <strong>{words.states[value]}</strong>
                    <span>{words.stateHints[value]}</span>
                  </span>
                </label>
              ))}
              {missing.state && <p id={`${ids}-state-error`} className="field-error">{words.stateRequired}</p>}
            </fieldset>

            <div className="field">
              <label className="field-label" htmlFor={noteId}>
                {words.note} <span className="muted">{words.noteOptional}</span>
              </label>
              <textarea
                id={noteId}
                className="input"
                rows={4}
                maxLength={FOLLOWUP_NOTE_MAX}
                value={note}
                placeholder={words.notePlaceholder}
                onChange={(event) => setNote(event.target.value)}
                aria-describedby={`${noteId}-count`}
              />
              <span id={`${noteId}-count`} className="field-hint">
                {words.noteCount.replace('{n}', String(note.length)).replace('{max}', String(FOLLOWUP_NOTE_MAX))}
              </span>
            </div>

            {error && (
              <p id={errorId} className="banner error followup-error" role="alert">
                {error}
              </p>
            )}

            <div className="care-actions">
              <button
                type="submit"
                className="btn primary"
                aria-disabled={sending || undefined}
                aria-describedby={error ? errorId : undefined}
              >
                {sending ? words.submitting : words.submit}
              </button>
              <Link href={followupHref.timeline(item.id)} className="link followup-cancel">
                {words.cancel}
              </Link>
            </div>
          </form>
        </div>

        <aside className="stack">
          <CaseContextCard item={item} petLine={petLine} dict={dict} locale={locale} timeZone={timeZone} />
          <section className="card followup-next" aria-labelledby={`${ids}-next`}>
            <h2 id={`${ids}-next`}>{words.nextTitle}</h2>
            <p>{words.nextBody}</p>
            <p className="small">{words.nextFree}</p>
          </section>
        </aside>
      </div>
    </>
  )
}
