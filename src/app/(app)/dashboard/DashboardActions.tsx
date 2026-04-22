'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { Cat } from '@/types'

const CheckModal = dynamic(() => import('./CheckModal'), { ssr: false })

interface Props {
  cats: Pick<Cat, 'id' | 'name' | 'breed' | 'age_years' | 'sex'>[]
}

export default function DashboardActions({ cats }: Props) {
  const [open, setOpen] = useState(false)

  if (!cats.length) {
    return (
      <div className="text-right">
        <Link
          href="/cats/new"
          className="bg-orange-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors inline-block"
        >
          Добавить кота
        </Link>
        <p className="text-xs text-gray-400 mt-1.5">нужен для проверки симптомов</p>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-orange-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors"
      >
        Проверить симптомы
      </button>
      {open && <CheckModal cats={cats} onClose={() => setOpen(false)} />}
    </>
  )
}
