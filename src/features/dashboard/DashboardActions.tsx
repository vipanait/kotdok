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
      <div className="shrink-0 text-left sm:text-right">
        <Link
          href="/cats/new"
          className="app-button-primary px-6 py-3 text-sm"
        >
          {t.addCatBtn}
        </Link>
        <p className="mt-2 max-w-48 text-xs leading-relaxed text-text-faint sm:ml-auto">{t.addCatHint}</p>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="app-button-primary shrink-0 px-6 py-3 text-sm"
      >
        {t.checkSymptomsBtn}
      </button>
      {open && <CheckModal cats={cats} onClose={() => setOpen(false)} />}
    </>
  )
}
