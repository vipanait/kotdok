'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { browserApi } from '@/features/api/browser-api'
import { useToday } from '@/features/forms/use-today'
import { initialRecordState, loadRecord, recordCache, recordReducer, type RecordState } from './record-load'

/**
 * The medical record of one pet through the v1 API: loaded on open, again on
 * «Повторить». An answer to an older request never overwrites a newer one.
 *
 * `today` is the owner's day the page counts from; it moves on at midnight
 * (MW-09, `useToday`), and the record is quietly loaded again for the new
 * day — «Принимает сейчас» is the server's, counted from the day sent.
 */
export function useMedicalRecord(petId: string): { state: RecordState; reload: () => void; today: string } {
  const [state, dispatch] = useReducer(recordReducer, petId, (id) => initialRecordState(recordCache.get(id)))
  const latest = useRef(0)
  const today = useToday()
  const todayRef = useRef(today)

  const run = useCallback(async () => {
    const request = ++latest.current
    // An answer to an older request (or for a pet no longer shown) is dropped, cache and all.
    const action = await loadRecord(browserApi(), petId, todayRef.current, () => request === latest.current)
    if (action) dispatch(action)
  }, [petId])

  useEffect(() => {
    void run()
    // A late answer for a pet the page no longer shows is dropped.
    return () => {
      latest.current += 1
    }
  }, [run])

  // A new day: the record again, under what is on screen.
  useEffect(() => {
    if (todayRef.current === today) return
    todayRef.current = today
    void run()
  }, [today, run])

  const reload = useCallback(() => {
    dispatch({ type: 'start' })
    void run()
  }, [run])

  return { state, reload, today }
}
