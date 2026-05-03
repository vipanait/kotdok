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
      <div className="text-right shrink-0">
        <Link
          href="/cats/new"
          className="inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
        >
          {t.addCatBtn}
        </Link>
        <p className="text-xs text-text-faint mt-1.5">{t.addCatHint}</p>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors shrink-0"
      >
        {t.checkSymptomsBtn}
      </button>
      {open && <CheckModal cats={cats} onClose={() => setOpen(false)} />}
    </>
  )
}
