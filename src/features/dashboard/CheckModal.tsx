'use client'

import { useEffect, useState } from 'react'
import CheckForm from '@/features/symptom-check/CheckForm'
import FeedbackModal from './FeedbackModal'
import type { Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'

interface Props {
  cats: Pick<Cat, 'id' | 'name' | 'breed' | 'age_years' | 'sex'>[]
  onClose: () => void
}

const FEEDBACK_DISMISSED_KEY = 'feedback_dismissed_session'

export default function CheckModal({ cats, onClose }: Props) {
  const dict = useTranslations()
  const [showFeedback, setShowFeedback] = useState(false)

  function handleFeedbackPrompt() {
    if (sessionStorage.getItem(FEEDBACK_DISMISSED_KEY)) return
    setShowFeedback(true)
  }

  function handleFeedbackClose() {
    sessionStorage.setItem(FEEDBACK_DISMISSED_KEY, '1')
    setShowFeedback(false)
    onClose()
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !showFeedback) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showFeedback])

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
        onClick={e => { if (e.target === e.currentTarget && !showFeedback) onClose() }}
      >
        <div className="bg-card rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[95dvh] overflow-y-auto">
          <CheckForm
            cats={cats}
            onClose={onClose}
            onFeedbackPrompt={handleFeedbackPrompt}
          />
        </div>
      </div>

      {showFeedback && (
        <FeedbackModal
          dict={dict.feedback}
          onClose={handleFeedbackClose}
        />
      )}
    </>
  )
}
