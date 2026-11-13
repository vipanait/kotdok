'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { CHECK_QUESTION_MAX, CHECK_QUESTION_MIN, type CheckQuestionThread, type Urgency } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { useLocale } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { useBrowserClock } from '@/features/followup/use-browser-clock'
import { clinicSearchUrl } from '@/features/symptom-check/clinic-search'
import type { Locale } from '@/shared/i18n/config'
import {
  alertText,
  isOpen,
  recheckHref,
  showsBlock,
  suggestionsFor,
  threadNote,
  type QuestionWords,
} from './check-questions-view'

/** Before the browser's clock is read, the server's word on the window stands. */
const SERVER_TIME = new Date(0)

/** The owner's calendar day, which the pet's record is read on. */
function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

/**
 * «Уточнить по этой проверке» under a saved result (CQ-02): up to three
 * questions about this check, within 48 hours of it, answered in place.
 *
 * The words are the check's language's, like the answers they frame. A
 * question keeps its Idempotency-Key until it is answered or its words change,
 * so a second press or a retry after a lost answer never spends a second place.
 */
export default function CheckQuestions({
  checkId,
  urgency,
  locale,
  petId,
  petName,
  followupCase,
  initial,
  words,
  timeZone,
}: {
  checkId: string
  urgency: Urgency
  /** The language of the check. */
  locale: Locale
  petId: string | null
  petName: string | null
  /** The case this check belongs to, for «Проверить снова». */
  followupCase: { id: string; status: string } | null
  initial: CheckQuestionThread
  words: QuestionWords
  timeZone?: string
}) {
  const pageLocale = useLocale()
  const ids = useId()
  const clock = useBrowserClock()
  const now = clock ?? SERVER_TIME
  const [thread, setThread] = useState(initial)
  const [text, setText] = useState('')
  /** The question on its way, shown under «Вы спросили» while the answer is awaited. */
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sent = useRef<{ question: string; key: string } | null>(null)

  if (!showsBlock(thread, now)) return null
  const open = isOpen(thread, now)

  async function ask(question: string) {
    if (pending !== null) return
    if (Array.from(question).length < CHECK_QUESTION_MIN) {
      setError(words.tooShort)
      return
    }
    if (sent.current?.question !== question) sent.current = { question, key: crypto.randomUUID() }
    const key = sent.current.key

    setPending(question)
    setError(null)
    try {
      const result = await browserApi().askCheckQuestion(checkId, key, { question }, today())
      setThread(result.thread)
      setText('')
      sent.current = null
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'rate_limited') {
        setError(words.tooOften)
      } else if (failure instanceof ApiError && failure.code === 'conflict') {
        // No places left, the window closed, or this very question is still
        // being answered: the thread itself says which.
        const fresh = await browserApi().getCheckQuestions(checkId).catch(() => null)
        if (fresh) setThread(fresh)
        if (!fresh || isOpen(fresh, new Date())) setError(words.failed)
      } else {
        setError(words.failed)
      }
    } finally {
      setPending(null)
    }
  }

  const titleId = `${ids}-title`
  const noteId = `${ids}-note`
  const suggestions = thread.items.length === 0 && pending === null ? suggestionsFor(urgency, words) : []

  return (
    <section
      className="card check-questions"
      aria-labelledby={titleId}
      lang={locale !== pageLocale ? locale : undefined}
    >
      <h2 id={titleId}>{words.title}</h2>
      <p id={noteId} className="small check-questions-note" aria-live="polite">
        {threadNote(thread, now, words, locale, timeZone)}
      </p>

      {(thread.items.length > 0 || pending !== null) && (
        <ol className="check-questions-thread">
          {thread.items.map((item) => {
            const plate = alertText(item.alert, petName, words)
            return (
              <li key={item.id}>
                <p className="small check-questions-who">{words.youAsked}</p>
                <p className="check-questions-question">{item.question}</p>
                <p className="small check-questions-who">{words.lapka}</p>
                <p className="check-questions-answer">{item.answer}</p>
                {plate && (
                  // The level's own colours: «сегодня» is urgent, «сейчас» an emergency.
                  <div className={`check-questions-alert ${item.alert === 'clinic_now' ? 'emergency' : 'urgent'}`} role="note">
                    <p>
                      <Icon name="info" />
                      {plate}
                    </p>
                    <div className="check-questions-alert-actions">
                      <a href={clinicSearchUrl(words.clinicSearchQuery)} target="_blank" rel="noopener noreferrer" className="btn primary">
                        {words.findClinic}
                      </a>
                      <Link href={recheckHref(petId, followupCase)} className="btn secondary">
                        {words.recheck}
                      </Link>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
          {pending !== null && (
            <li aria-busy>
              <p className="small check-questions-who">{words.youAsked}</p>
              <p className="check-questions-question">{pending}</p>
              <p className="small check-questions-waiting">{words.answering}</p>
            </li>
          )}
        </ol>
      )}

      {open && (
        <>
          {suggestions.length > 0 && (
            <div className="chips check-questions-suggestions" role="group" aria-label={words.suggestionsLabel}>
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" className="chip" onClick={() => setText(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form
            className="check-questions-form"
            onSubmit={(event) => {
              event.preventDefault()
              void ask(text.trim())
            }}
          >
            <textarea
              className="input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={words.placeholder}
              aria-label={words.fieldLabel}
              aria-describedby={noteId}
              maxLength={CHECK_QUESTION_MAX}
              rows={2}
              disabled={pending !== null}
            />
            <button type="submit" className="btn primary" disabled={pending !== null || text.trim().length === 0}>
              {words.ask}
              <Icon name="arrow" />
            </button>
          </form>
        </>
      )}

      {error && (
        <p className="banner error check-questions-error" role="alert">
          {error}
        </p>
      )}
      <p className="footnote check-questions-footnote">{words.note}</p>
    </section>
  )
}
