'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'

const CheckModal = dynamic(() => import('./CheckModal'), { ssr: false })

interface Props {
  cats: Pick<Cat, 'id' | 'name' | 'breed' | 'age_years' | 'sex'>[]
}

export default function DashboardActions({ cats }: Props) {
  const dict = useTranslations()
  const t = dict.dashboard
  const [open, setOpen] = useState(false)

  if (!cats.length) {
    return (
      <div>
        <Link href="/cats/new" className="app-button-primary w-full px-6 py-3 text-sm">
          {t.addCatBtn}
        </Link>
        <p className="mt-2 text-xs leading-relaxed text-text-faint">{t.addCatHint}</p>
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
      {open && <CheckModal cats={cats} onClose={() => setOpen(false)} />}
    </>
  )
}
