'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [doses, setDoses] = useState<MedicationDose[]>([])
  const [status, setStatus] = useState<TodayDosesState['status']>('loading')
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<TodayDosesState['error']>(null)
  const latest = useRef(0)
  const timed = courses.some((course) => course.reminder_times.length > 0)

  const load = useCallback(async () => {
    if (!timed) {
      setStatus('ready')
      return
    }
    const request = ++latest.current
    try {
      const read = await browserApi().listDoses(petId, today, today)
      if (request !== latest.current) return
      setDoses(read)
      setStatus('ready')
    } catch {
      if (request !== latest.current) return
      setStatus((current) => (current === 'ready' ? current : 'failed'))
    }
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
        const same = (entry: MedicationDose) => doseKey(entry.medication_id, entry.taken_on, entry.slot) === key
        setDoses((current) => [...current.filter((entry) => !same(entry)), ...result.doses.filter(same)])
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
    status,
    rows: todayDoses(courses, doses, today, clockNow()),
    pending,
    error,
    mark: (dose) => void act(dose, 'mark'),
    unmark: (dose) => void act(dose, 'unmark'),
    reload: () => void load(),
  }
}
