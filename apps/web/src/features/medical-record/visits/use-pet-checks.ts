'use client'

import { useEffect, useState } from 'react'
import { HISTORY_PAGE_SIZE_MAX, type SymptomCheckRecord } from '@lapka/contracts'
import { browserApi } from '@/features/api/browser-api'

/**
 * The pet's saved checks (newest first, the one page the server serves at
 * most): what a visit's link to a check is drawn from — its day and urgency —
 * and what the visit form offers to link. Secondary: if it fails, the visit
 * still shows, its link without the day, and the form offers no choice.
 */
export type PetChecks = { status: 'loading' | 'failed'; items: [] } | { status: 'ready'; items: SymptomCheckRecord[] }

export function usePetChecks(petId: string): PetChecks {
  const [state, setState] = useState<PetChecks>({ status: 'loading', items: [] })

  useEffect(() => {
    let live = true
    browserApi()
      .listChecks({ pet_id: petId, limit: HISTORY_PAGE_SIZE_MAX })
      .then((page) => {
        if (live) setState({ status: 'ready', items: page.items })
      })
      .catch((error) => {
        if (!live) return
        console.warn('[medical-record] checks of the pet did not load', error)
        setState({ status: 'failed', items: [] })
      })
    return () => {
      live = false
    }
  }, [petId])

  return state
}
