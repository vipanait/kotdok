'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { VetSummary } from '@lapka/contracts'
import { browserApi } from '@/features/api/browser-api'
import { classifyFailure, initialRecordState, recordCache, recordReducer, type RecordState } from '../record-load'

/**
 * The summary for the vet through the v1 API (`getVetSummary`), in the
 * record's load states: a skeleton, an error with a retry instead of an
 * empty summary, nothing at all for a pet that is not the caller's. Never
 * cached: every visit to the page reads what the record holds now.
 */
export function useVetSummary(petId: string): { state: RecordState<VetSummary>; reload: () => void } {
  const [state, dispatch] = useReducer(recordReducer<VetSummary>, null, initialRecordState<VetSummary>)
  const latest = useRef(0)

  const run = useCallback(async () => {
    const request = ++latest.current
    try {
      const data = await browserApi().getVetSummary(petId)
      if (request !== latest.current) return
      dispatch({ type: 'loaded', data })
    } catch (error) {
      if (request !== latest.current) return
      const failure = classifyFailure(error)
      // Whatever was kept of a record must not outlive the right to see it.
      if (failure === 'signed_out' || failure === 'deleting') recordCache.clear()
      if (failure === 'not_found') recordCache.forget(petId)
      if (failure === 'failed') console.warn('[vet-summary] load failed', error)
      dispatch({ type: 'failed', failure })
    }
  }, [petId])

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
