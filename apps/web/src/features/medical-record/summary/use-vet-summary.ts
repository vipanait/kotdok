'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { VetSummary } from '@lapka/contracts'
import { browserApi } from '@/features/api/browser-api'
import { initialRecordState, loadStep, recordReducer, type RecordState } from '../record-load'

/**
 * The summary for the vet through the v1 API (`getVetSummary`) for the
 * owner's day `today` — which courses are taken now and which visits are of
 * the last year count from it, as on the page — in the
 * record's load states: a skeleton, an error with a retry instead of an
 * empty summary, nothing at all for a pet that is not the caller's. Never
 * cached: every visit to the page reads what the record holds now.
 */
export function useVetSummary(petId: string, today: string): { state: RecordState<VetSummary>; reload: () => void } {
  const [state, dispatch] = useReducer(recordReducer<VetSummary>, null, initialRecordState<VetSummary>)
  const latest = useRef(0)

  const run = useCallback(async () => {
    const request = ++latest.current
    // Never kept: `loadStep` only forgets what the tab kept of the record when access ends.
    const action = await loadStep(() => browserApi().getVetSummary(petId, today), petId, () => request === latest.current, {
      label: 'vet-summary',
    })
    if (action) dispatch(action)
  }, [petId, today])

  useEffect(() => {
    void run()
    return () => {
      latest.current += 1
    }
  }, [run])

  const reload = useCallback(() => {
    dispatch({ type: 'start' })
    void run()
  }, [run])

  return { state, reload }
}
