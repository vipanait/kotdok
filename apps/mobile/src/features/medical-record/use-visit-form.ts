import { useEffect, useRef, useState } from 'react'
import { router } from 'expo-router'
import { HISTORY_PAGE_SIZE_MAX, type SymptomCheckRecord } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useCacheReader } from '@/lib/query-cache'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { newRequestKey } from '@/lib/request-key'
import { useText } from '@/i18n'
import type { FieldHandle } from '@/ui/Field'
import {
  checkChoices,
  firstVisitError,
  newVisitDraft,
  readVisit,
  visitDraftFrom,
  visitLocked,
  visitPatch,
  type VisitDraft,
  type VisitErrors,
} from './visits'
import { useReminders } from './reminders/ReminderProvider'
import { useOverviewReader, useRecordChanged } from './record-cache'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'

export type VisitFormMode = 'new' | 'edit' | 'done'

export type VisitFormParams = {
  eventId?: string
  /** From a check result: link it, «Болезнь», its first line as the reason. */
  checkId?: string
  reason?: string
  /** From the first steps (FB-2/04): `planned` with kind `checkup` opens a plan of a checkup. */
  plan?: string
}

/**
 * The visit form's state and its save (M9): the draft — new, or a plan from
 * the pet's record — the checks it may link to, the questions on leaving it
 * unsaved, and the save, which moves to the first field to correct when it
 * is refused. The screen only draws it.
 */
export function useVisitForm(petId: string, mode: VisitFormMode, params: VisitFormParams) {
  const t = useText()
  const reminders = useReminders()
  const recordChanged = useRecordChanged()
  const readOverview = useOverviewReader()
  const read = useCacheReader()
  const [initial, setInitial] = useState<VisitDraft | null>(null)
  const [draft, setDraft] = useState<VisitDraft | null>(null)
  const [keptDate, setKeptDate] = useState<string | undefined>(undefined)
  /** This pet's latest checks as loaded; which of them the form offers is worked out when drawn. */
  const [loadedChecks, setLoadedChecks] = useState<SymptomCheckRecord[]>([])
  const [errors, setErrors] = useState<VisitErrors>({})
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  /** A visit that happened: nothing here can change it. */
  const [locked, setLocked] = useState(false)
  const requestKey = useRef(newRequestKey())
  /** The form's text inputs by field (`firstVisitError`'s names), to move to the first error. */
  const inputs = useRef(new Map<string, FieldHandle>())
  const input = (field: string) => (node: FieldHandle | null) => {
    if (node) inputs.current.set(field, node)
    else inputs.current.delete(field)
  }
  const nextKey = useRef(1)

  useEffect(() => {
    // The same page the visits screen shows, through its cache.
    read(queryKeys.checks(petId, HISTORY_PAGE_SIZE_MAX), () => withFreshSession((api) => api.listChecks({ pet_id: petId, limit: HISTORY_PAGE_SIZE_MAX })))
      .then((page) => setLoadedChecks(page.items))
      .catch(() => setLoadedChecks([]))

    if (mode === 'new') {
      const start = newVisitDraft({ plan: params.plan, checkId: params.checkId, reason: params.reason })
      setInitial(start)
      setDraft(start)
      return
    }
    readOverview(petId)
      .then((overview) => {
        const visit = overview.events.find((event) => event.id === params.eventId && event.kind === 'visit')
        if (!visit) throw new Error('not found')
        if (visitLocked(visit)) {
          setLocked(true)
          return
        }
        const start = visitDraftFrom(visit, mode === 'done' ? 'done' : undefined)
        setKeptDate(visit.date)
        setInitial(start)
        setDraft(start)
      })
      .catch((cause) => setError(describeFailure(t, cause, t.medicalRecord.loadEventFailed)))
  }, [petId, mode, params.eventId, params.checkId, params.reason, params.plan, t, read, readOverview])

  const changed = draft !== null && initial !== null && JSON.stringify(draft) !== JSON.stringify(initial)
  const unsaved = useUnsavedChanges(changed)
  const change = (patch: Partial<VisitDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current))

  function addPrescription() {
    if (!draft) return
    change({
      prescriptions: [...draft.prescriptions, { key: `new-${nextKey.current++}`, name: '', instructions: '', toMedicines: true }],
    })
  }

  // Checks of the last 30 days, and the one the visit was opened with however
  // old: a plan linked to it, or a new visit written from that check's result.
  const checkOptions = draft
    ? checkChoices(t, loadedChecks, { linked: initial?.checkId ?? null, chosen: draft.checkId })
    : []

  async function save(then: () => void = () => router.back()) {
    if (!draft) return
    const read = readVisit(t, draft, mode, new Date(), keptDate)
    if (!read.ok) {
      setErrors(read.errors)
      // As on the site: the first field to correct, brought into view with the keyboard up.
      const first = firstVisitError(read.errors, draft)
      if (first) inputs.current.get(first)?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    setError(null)
    try {
      const value = read.value
      await withFreshSession<unknown>((api) => {
        if (mode === 'new') return api.createVisit(petId, value, requestKey.current, localToday())
        return api.changeVisit(petId, params.eventId!, visitPatch(value, mode, keptDate), requestKey.current, localToday())
      })
      void recordChanged(petId)
      if (value.status === 'planned' && mode === 'new') reminders.planSaved({ kind: 'visit', name: null, targets: [] })
      unsaved.leave(then)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'record_done') {
        // Marked «Был» meanwhile (another device): history now, nothing to save.
        unsaved.leave(() => setLocked(true))
      } else if (cause instanceof ApiError && cause.code === 'conflict') setError({ text: t.medicalRecord.alreadySaved, offline: false })
      else setError(describeFailure(t, cause, t.medicalRecord.saveEventFailed))
    } finally {
      setBusy(false)
    }
  }

  return { draft, errors, error, busy, locked, unsaved, checkOptions, input, change, addPrescription, save }
}
