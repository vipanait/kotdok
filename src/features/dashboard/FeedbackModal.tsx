'use client'

import { useEffect, useState } from 'react'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { FeedbackRating } from '@/shared/types'
import { csrfHeaders } from '@/shared/security/csrf-client'

interface Props {
  onClose: () => void
  dict: Dictionary['feedback']
}

export default function FeedbackModal({ onClose, dict }: Props) {
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit() {
    if (!rating) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      })
      if (!res.ok) {
        setError(dict.errorGeneric)
        setLoading(false)
        return
      }
      setDone(true)
      setTimeout(onClose, 2000)
    } catch {
      setError(dict.errorGeneric)
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dict.title}
      className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-text/70 hover:text-text w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors text-xl leading-none"
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="p-6 sm:p-8">
          {done ? (
            <div className="py-6 text-center space-y-3">
              <div className="text-5xl">🎉</div>
              <h2 className="font-serif text-2xl font-bold text-text">{dict.thanks}</h2>
              <p className="text-sm text-text-muted">{dict.thanksSubtitle}</p>
            </div>
          ) : (
            <>
              <div className="mb-5 pr-10">
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-text">{dict.title}</h2>
                <p className="mt-2 text-sm text-text-muted">{dict.subtitle}</p>
              </div>

              <div className="flex gap-3 mb-5">
                <button
                  type="button"
                  onClick={() => setRating('liked')}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 py-4 text-sm font-semibold transition-colors ${
                    rating === 'liked'
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-hairline bg-card text-text hover:border-accent/50'
                  }`}
                >
                  <span aria-hidden>👍</span>
                  {dict.liked}
                </button>
                <button
                  type="button"
                  onClick={() => setRating('disliked')}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 py-4 text-sm font-semibold transition-colors ${
                    rating === 'disliked'
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-hairline bg-card text-text hover:border-accent/50'
                  }`}
                >
                  <span aria-hidden>👎</span>
                  {dict.disliked}
                </button>
              </div>

              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={dict.commentPlaceholder}
                maxLength={500}
                rows={3}
                className="w-full bg-card border border-hairline rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none mb-4"
              />

              {error && (
                <div className="bg-status-error-bg text-status-error-fg text-sm rounded-xl px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full border border-hairline bg-card text-text py-3 text-sm font-medium hover:bg-canvas-soft transition-colors"
                >
                  {dict.skip}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!rating || loading}
                  className="flex-1 rounded-full bg-accent text-white py-3 text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                    </span>
                  ) : dict.submit}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
