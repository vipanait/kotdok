'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { Pet } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'

const CheckModal = dynamic(() => import('./CheckModal'), { ssr: false })

interface Props {
  pets: Pick<Pet, 'id' | 'name' | 'breed' | 'age_years' | 'sex' | 'species'>[]
}

export default function DashboardActions({ pets }: Props) {
  const dict = useTranslations()
  const t = dict.dashboard
  const [open, setOpen] = useState(false)

  if (!pets.length) {
    return (
      <div>
        <Link href="/pets/new" className="app-button-primary w-full px-6 py-3 text-sm">
          {t.addPetBtn}
        </Link>
        <p className="mt-2 text-xs leading-relaxed text-text-faint">{t.addPetHint}</p>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="app-button-primary w-full px-6 py-4 text-sm sm:text-base"
      >
        {t.checkSymptomsBtn}
      </button>
      {open && <CheckModal pets={pets} onClose={() => setOpen(false)} />}
    </>
  )
}
