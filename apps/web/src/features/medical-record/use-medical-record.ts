'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { browserApi } from '@/features/api/browser-api'
import {
  classifyFailure,
  fetchRecord,
  initialRecordState,
  recordCache,
  recordReducer,
  type RecordState,
} from './record-load'

/**
 * The medical record of one pet through the v1 API: loaded on open, again on
 * «Повторить». An answer to an older request never overwrites a newer one.
 */
export function useMedicalRecord(petId: string): { state: RecordState; reload: () => void } {
  const [state, dispatch] = useReducer(recordReducer, petId, (id) => initialRecordState(recordCache.get(id)))
  const latest = useRef(0)

  const run = useCallback(async () => {
    const request = ++latest.current
    try {
      const data = await fetchRecord(browserApi(), petId)
      if (request !== latest.current) return
      recordCache.set(petId, data)
      dispatch({ type: 'loaded', data })
    } catch (error) {
      if (request !== latest.current) return
      const failure = classifyFailure(error)
      // Whatever was kept of this record must not outlive the right to see it.
      if (failure === 'signed_out' || failure === 'deleting') recordCache.clear()
      if (failure === 'not_found') recordCache.forget(petId)
      // Expected when offline; the screen says so. Logged for whoever debugs it, not as an error.
      if (failure === 'failed') console.warn('[medical-record] load failed', error)
      dispatch({ type: 'failed', failure })
    }
  }, [petId])

  useEffect(() => {
    void run()
    // A late answer for a pet the page no longer shows is dropped.
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
