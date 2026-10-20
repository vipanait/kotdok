'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Medication, MedicationDose } from '@lapka/contracts'
import { doseKey, todayDoses, type TodayDose } from '@lapka/shared'
import { browserApi } from '@/features/api/browser-api'
import { createDoseActions, type DoseFailure } from './dose-actions'

/** The owner's «ЧЧ:ММ» now, on the browser's own clock. */
function clockNow(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

type Read = { doses: MedicationDose[]; status: 'loading' | 'ready' | 'failed' }
type ReadAction =
  | { type: 'loaded'; doses: MedicationDose[] }
  | { type: 'failed' }
  /** One dose as the server now has it: `doses` holds it when marked, not when taken off. */
  | { type: 'applied'; key: string; doses: MedicationDose[] }

const keyOf = (dose: MedicationDose) => doseKey(dose.medication_id, dose.taken_on, dose.slot)

function readReducer(state: Read, action: ReadAction): Read {
  switch (action.type) {
    case 'loaded':
      return { doses: action.doses, status: 'ready' }
    case 'failed':
      // A failed refresh keeps what is shown; only a first read fails the block.
      return state.status === 'ready' ? state : { ...state, status: 'failed' }
    case 'applied':
      // Applied to what is shown now, not to what it was when pressed: two
      // doses pressed one after the other both stay.
      return {
        ...state,
        doses: [...state.doses.filter((dose) => keyOf(dose) !== action.key), ...action.doses.filter((dose) => keyOf(dose) === action.key)],
      }
  }
}

export type TodayDosesState = {
  /** null while the day's marks are being read; failed if they could not be. */
  status: 'loading' | 'ready' | 'failed'
  rows: TodayDose[]
  pending: ReadonlySet<string>
  /** The dose a press failed on, and why. */
  error: { key: string; reason: DoseFailure } | null
  mark: (dose: TodayDose) => void
  unmark: (dose: TodayDose) => void
  reload: () => void
}

/**
 * «Сегодня» of one pet (FB-5/04): today's doses of its courses and which
 * are given, read from the server for the owner's day. Marks are the
 * server's — the same the phone reads — and are read again when the tab
 * comes back into view, so a dose marked on the phone shows up here.
 */
export function useTodayDoses(petId: string, courses: readonly Medication[], today: string): TodayDosesState {
  const router = useRouter()
  const actions = useMemo(() => createDoseActions(browserApi(), petId), [petId])
  const [{ doses, status }, dispatch] = useReducer(readReducer, { doses: [], status: 'loading' })
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<TodayDosesState['error']>(null)
  const latest = useRef(0)
  const timed = courses.some((course) => course.reminder_times.length > 0)

  const load = useCallback(async () => {
    // No course has times: nothing to read, and nothing to show.
    if (!timed) return
    const request = ++latest.current
    const read = await browserApi()
      .listDoses(petId, today, today)
      .then(
        (doses) => ({ ok: true as const, doses }),
        () => ({ ok: false as const }),
      )
    // An answer to an older read, or for a press made since, is dropped.
    if (request !== latest.current) return
    dispatch(read.ok ? { type: 'loaded', doses: read.doses } : { type: 'failed' })
  }, [petId, today, timed])

  useEffect(() => {
    void load()
    return () => {
      latest.current += 1
    }
  }, [load])

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
    }
  }, [load])

  const act = useCallback(
    async (dose: TodayDose, kind: 'mark' | 'unmark') => {
      const key = doseKey(dose.course.id, today, dose.slot)
      if (actions.isPending(dose.course.id, today, dose.slot)) return
      setError(null)
      setPending((current) => new Set(current).add(key))
      // A newer read must not overwrite what this press is about to show.
      latest.current += 1
      const result = await (kind === 'mark' ? actions.mark : actions.unmark)(doses, dose.course.id, today, dose.slot)
      setPending((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
      if (result.ok) {
        // Applied to what is shown now, not to what it was when pressed: two
        // doses pressed one after the other both stay.
        dispatch({ type: 'applied', key, doses: result.doses })
        return
      }
      if (result.reason === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      if (result.reason !== 'busy') setError({ key, reason: result.reason })
    },
    [actions, doses, today, router],
  )

  return {
    status: timed ? status : 'ready',
    rows: todayDoses(courses, doses, today, clockNow()),
    pending,
    error,
    mark: (dose) => void act(dose, 'mark'),
    unmark: (dose) => void act(dose, 'unmark'),
    reload: () => void load(),
  }
}
