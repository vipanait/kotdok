'use client'

import { useEffect } from 'react'
import CheckForm from '@/features/symptom-check/CheckForm'
import { useTranslations } from '@/components/LocaleProvider'
import type { Pet } from '@/shared/types'

interface Props {
  pets: Pick<Pet, 'id' | 'name' | 'breed' | 'age_years' | 'sex' | 'species'>[]
  onClose: () => void
}

export default function CheckModal({ pets, onClose }: Props) {
  const dict = useTranslations()

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dict.check.modalHeading}
      className="app-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="app-card max-h-[95dvh] w-full overflow-y-auto rounded-b-none sm:max-w-2xl sm:rounded-b-3xl">
        <CheckForm pets={pets} onClose={onClose} />
      </div>
    </div>
  )
}
