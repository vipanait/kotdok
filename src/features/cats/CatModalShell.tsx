'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CatForm from '@/features/cats/CatForm'
import type { Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'

interface Props {
  cat?: Cat
}

/**
 * Wraps {@link CatForm} in a modal sheet shown over the dashboard backdrop.
 * Closing (X / Esc / backdrop click) returns to `/dashboard`.
 */
export default function CatModalShell({ cat }: Props) {
  const router = useRouter()
  const dict = useTranslations()

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.push('/dashboard')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="app-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) router.push('/dashboard') }}
    >
      <div className="app-card relative max-h-[95dvh] w-full overflow-y-auto rounded-b-none sm:max-w-2xl sm:rounded-b-3xl">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="app-icon-button absolute top-4 right-4 z-10 text-xl leading-none"
          aria-label={dict.common.close}
        >
          ×
        </button>
        <CatForm cat={cat} modal />
      </div>
    </div>
  )
}
