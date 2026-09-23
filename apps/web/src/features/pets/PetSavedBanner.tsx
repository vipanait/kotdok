'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { PetSavedKind } from '@/features/pets/pet-saved'

/**
 * Confirmation after the pet form: `?petSaved=created|updated|deleted`.
 * A new pet also gets the next step, checking its symptoms, when the balance
 * allows one.
 */
export default function PetSavedBanner({
  kind,
  dict,
  canCheck,
}: {
  kind: PetSavedKind
  dict: Dictionary
  canCheck: boolean
}) {
  const t = dict.dashboard
  const ref = useRef<HTMLDivElement>(null)
  // It arrives with the page, where a live region is not announced; taking
  // focus is what makes a screen reader read it.
  useEffect(() => { ref.current?.focus() }, [])
  const text = kind === 'created' ? t.petAdded : kind === 'deleted' ? t.petDeleted : t.petSaved
  return (
    <div ref={ref} tabIndex={-1} role="status" className="banner toast-banner pet-saved-banner">
      <span>{text}</span>
      {kind === 'created' && canCheck && (
        <Link href="/check" className="link">{t.welcomeCta}</Link>
      )}
    </div>
  )
}
