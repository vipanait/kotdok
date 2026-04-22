'use client'

import { useEffect } from 'react'
import CheckForm from '@/app/check/CheckForm'
import type { Cat } from '@/types'

interface Props {
  cats: Pick<Cat, 'id' | 'name' | 'breed' | 'age_years' | 'sex'>[]
  onClose: () => void
}

export default function CheckModal({ cats, onClose }: Props) {
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[95dvh] overflow-y-auto">
        <CheckForm cats={cats} onClose={onClose} />
      </div>
    </div>
  )
}
