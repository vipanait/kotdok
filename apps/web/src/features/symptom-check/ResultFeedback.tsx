'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/components/LocaleProvider'
import type { FeedbackRating } from '@/shared/types'
import { csrfHeaders } from '@/shared/security/csrf-client'

type Stage = 'loading' | 'ask' | 'comment' | 'done' | 'hidden'

/**
 * "Was this useful?" beside one result.
 *
 * Inline rather than a dialog, so it never gets in the way of the result.
 * The rating is stored on the tap, so an answer is
 * never lost to someone who closes the page before writing a comment; the
 * comment, if any, replaces it with the same rating.
 */
export default function ResultFeedback({ checkId }: { checkId: string }) {
  const t = useTranslations().feedback
  const [stage, setStage] = useState<Stage>('loading')
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/feedback?check_id=${encodeURIComponent(checkId)}`)
      .then(async res => {
        if (cancelled) return
        if (!res.ok) { setStage('hidden'); return }
        const data = await res.json() as { rating: FeedbackRating | null }
        setStage(data.rating ? 'done' : 'ask')
      })
      // Asking is optional; a failure to learn the state hides the block
      // rather than putting an error under someone's result.
      .catch(() => { if (!cancelled) setStage('hidden') })
    return () => { cancelled = true }
  }, [checkId])

  async function send(nextRating: FeedbackRating, nextComment?: string): Promise<boolean> {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ check_id: checkId, rating: nextRating, comment: nextComment }),
      })
      if (!res.ok) { setError(t.errorGeneric); return false }
      return true
    } catch {
      setError(t.errorGeneric)
      return false
    } finally {
      setSending(false)
    }
  }

  async function choose(nextRating: FeedbackRating) {
    setRating(nextRating)
    if (await send(nextRating)) setStage('comment')
  }

  async function submitComment() {
    const trimmed = comment.trim()
    if (!rating) return
    if (!trimmed || await send(rating, trimmed)) setStage('done')
  }

  if (stage === 'loading' || stage === 'hidden') return null

  if (stage === 'done') {
    return (
      <section className="feedback">
        <p className="feedback-thanks" role="status">
          <span aria-hidden>✓</span>
          {t.thanks}
        </p>
      </section>
    )
  }

  return (
    <section className="feedback" aria-labelledby="feedback-title">
      <h3 id="feedback-title">{t.title}</h3>
      <p className="small feedback-subtitle">{t.subtitle}</p>
      <div className="row">
        {(['liked', 'disliked'] as const).map(value => (
          <button
            key={value}
            type="button"
            className="btn secondary"
            onClick={() => void choose(value)}
            disabled={sending}
            aria-pressed={rating === value}
          >
            {value === 'liked' ? t.yes : t.no}
          </button>
        ))}
      </div>

      {stage === 'comment' && (
        <>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={t.commentPlaceholder}
            aria-label={t.commentPlaceholder}
            maxLength={500}
            rows={3}
            className="input"
          />
          <button
            type="button"
            onClick={() => void submitComment()}
            disabled={sending}
            className="btn primary block"
          >
            {t.submit}
          </button>
        </>
      )}

      {error && <p className="banner error feedback-error" role="alert">{error}</p>}
    </section>
  )
}
