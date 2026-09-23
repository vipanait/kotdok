'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/components/LocaleProvider'
import type { FeedbackRating } from '@/shared/types'
import { csrfHeaders } from '@/shared/security/csrf-client'

type Stage = 'loading' | 'ask' | 'comment' | 'done' | 'hidden'

/**
 * "Was this answer useful?" under one result.
 *
 * Inline rather than a modal: a modal over the check modal is what made the
 * earlier prompt misbehave. The rating is stored on the tap, so an answer is
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
      <p className="flex items-center justify-center gap-2 rounded-[20px] bg-canvas-soft p-4 text-sm text-text-muted">
        <span aria-hidden>✓</span>
        {t.thanks}
      </p>
    )
  }

  return (
    <div className="rounded-[20px] bg-canvas-soft p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text">{t.question}</p>
        <div className="flex gap-2">
          {(['liked', 'disliked'] as const).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => void choose(value)}
              disabled={sending}
              aria-label={value === 'liked' ? t.liked : t.disliked}
              aria-pressed={rating === value}
              className={`app-focus-ring flex h-11 w-11 items-center justify-center rounded-full border-2 text-lg transition-colors ${
                rating === value
                  ? 'border-accent bg-accent/10'
                  : 'border-hairline bg-card hover:border-accent/50'
              }`}
            >
              <span aria-hidden>{value === 'liked' ? '👍' : '👎'}</span>
            </button>
          ))}
        </div>
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
            className="app-input resize-none"
          />
          <button
            type="button"
            onClick={() => void submitComment()}
            disabled={sending}
            className="app-button-primary w-full py-3 text-sm"
          >
            {t.submit}
          </button>
        </>
      )}

      {error && (
        <p className="rounded-xl bg-status-error-bg px-4 py-3 text-sm text-status-error-fg">{error}</p>
      )}
    </div>
  )
}
