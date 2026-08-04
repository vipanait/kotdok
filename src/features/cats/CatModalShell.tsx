'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CatForm from '@/features/cats/CatForm'
import type { Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'

interface Props {
  cat?: Cat
}

/**
 * Wraps {@link CatForm} in a modal sheet shown over the dashboard backdrop.
 * Closes via the X button or Escape. Backdrop clicks never dismiss the form.
 * If there are unsaved changes, closing asks for confirmation first.
 */
export default function CatModalShell({ cat }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.cats
  const [open, setOpen] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const close = useCallback((href = '/dashboard') => {
    setOpen(false)
    setConfirmClose(false)
    router.replace(href)
  }, [router])

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmClose(true)
      return
    }
    close()
  }, [close, dirty])

  useEffect(() => {
    if (!open) return

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (confirmClose) {
        setConfirmClose(false)
        return
      }
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmClose, open, requestClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="app-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
    >
      <div className="app-card relative max-h-[95dvh] w-full overflow-y-auto rounded-b-none sm:max-w-2xl sm:rounded-b-3xl">
        <button
          type="button"
          onClick={requestClose}
          className="app-icon-button absolute top-4 right-4 z-10 text-xl leading-none"
          aria-label={dict.common.close}
        >
          ×
        </button>
        <CatForm
          cat={cat}
          modal
          onDirtyChange={setDirty}
          onCancel={requestClose}
          onSaved={kind => close(`/dashboard?catSaved=${kind}`)}
        />
      </div>

      {confirmClose && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-cat-form-title"
          className="app-overlay fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirmClose(false) }}
        >
          <div className="app-card w-full rounded-b-none p-6 sm:max-w-sm sm:rounded-b-3xl">
            <h2 id="close-cat-form-title" className="text-lg font-bold text-text mb-2">
              {t.confirmCloseTitle}
            </h2>
            <p className="text-sm text-text-muted mb-5">{t.confirmCloseBody}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="app-button-secondary flex-1 py-3 text-sm"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={() => close()}
                className="app-button-primary flex-1 py-3 text-sm"
              >
                {t.confirmCloseBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
