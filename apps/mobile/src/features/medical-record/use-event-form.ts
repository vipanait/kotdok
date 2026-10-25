import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { router } from 'expo-router'
import type { HealthEvent, PetSpecies } from '@lapka/contracts'
import { ApiError, completionMismatch } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday, parseDayInput } from '@/lib/calendar-day'
import { newRequestKey } from '@/lib/request-key'
import { useText } from '@/i18n'
import {
  blankItem,
  completionRequest,
  draftChanged,
  eventPatch,
  formStart,
  formSummary,
  plannedItem,
  readDraft,
  type DraftErrors,
  type EventDraft,
  type FormMode,
  type ItemDraft,
} from './event-form'
import { useReminders } from './reminders/ReminderProvider'
import { useOverviewReader, useRecordChanged } from './record-cache'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'

export type EventFormParams = {
  /** vaccination (default) or parasite */
  kind?: string
  status?: string
  eventId?: string
  itemId?: string
}

/**
 * The record form's state and its one save (M6, M14, M16): the draft built
 * from the pet's record, the questions on leaving it unsaved, and the save
 * itself, once however many times «Сохранить» is pressed — each form sends
 * its own Idempotency-Key. The screen only draws it.
 */
export function useEventForm(petId: string, mode: FormMode, params: EventFormParams) {
  // A new record says its kind; an existing one brings its own when it loads —
  // until then the screen is not named after a kind it may not be (MW-09).
  const [kind, setKind] = useState<HealthEvent['kind'] | null>(
    params.kind === 'parasite' ? 'parasite' : params.kind === 'vaccination' || mode === 'new' ? 'vaccination' : null,
  )
  const t = useText()
  const reminders = useReminders()
  const recordChanged = useRecordChanged()
  const readOverview = useOverviewReader()
  const words = t.medicalRecord

  const [species, setSpecies] = useState<PetSpecies | null>(null)
  const [initial, setInitial] = useState<EventDraft | null>(null)
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [source, setSource] = useState<{ event: HealthEvent; others: number } | null>(null)
  const [keptDate, setKeptDate] = useState<string | undefined>(undefined)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  /**
   * Nothing to correct any more, only a way back, and why: an edit of a record
   * that was done (on opening, or refused as record_done on saving), or a
   * «Сделано» answered with the record an earlier try saved — then `record`
   * is that record, which the screen offers to open.
   */
  const [locked, setLocked] = useState<{ text: string; tone: 'info' | 'error'; record?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const requestKey = useRef(newRequestKey())
  const nextKey = useRef(1)

  const load = useCallback(async () => {
    setError(null)
    try {
      const overview = await readOverview(petId)
      setSpecies(overview.pet.species)
      const start = formStart(overview.events, {
        mode,
        kind,
        status: params.status,
        eventId: params.eventId,
        itemId: params.itemId,
      })
      if (!start) throw new Error('not found')
      setKind(start.kind)
      if (start.state === 'locked') {
        setLocked({ text: t.errors.recordDone, tone: 'info' })
        return
      }
      if (start.keptDate !== undefined) setKeptDate(start.keptDate)
      if (start.source) setSource(start.source)
      setInitial(start.draft)
      setDraft(start.draft)
    } catch (cause) {
      setError(describeFailure(t, cause, words.loadEventFailed))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the kind of a new record is fixed by the route
  }, [petId, mode, params.status, params.eventId, params.itemId, t, words.loadEventFailed, readOverview])

  useEffect(() => {
    void load()
  }, [load])

  const changed = draft !== null && initial !== null && draftChanged(initial, draft)
  const unsaved = useUnsavedChanges(changed)

  const change = (patch: Partial<EventDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current))

  /** One item changed in place: picked from the catalogue, typed, marked as no product, or its next date. */
  function updateItem(key: string, next: (item: ItemDraft) => ItemDraft) {
    setDraft((current) =>
      current ? { ...current, items: current.items.map((item) => (item.key === key ? next(item) : item)) } : current,
    )
  }

  function addItem() {
    if (!draft) return
    const key = `new-${nextKey.current++}`
    change({ items: [...draft.items, blankItem(key, draft.kind)] })
  }

  const recordDay = draft ? (draft.status === 'done' ? parseDayInput(draft.date) : null) : null
  const showNext = draft !== null && mode !== 'edit' && draft.status === 'done'

  const summary = useMemo(
    () => (draft ? formSummary(t, { draft, mode, recordDay, others: source?.others ?? 0 }, localToday()) : null),
    [draft, recordDay, mode, source, t],
  )

  async function save(then: () => void = () => router.back()) {
    if (!draft) return
    const read = readDraft(t, draft, mode, new Date(), keptDate)
    if (!read.ok) {
      setErrors(read.errors)
      return
    }
    setErrors({})
    setBusy(true)
    setError(null)
    try {
      const value = read.value
      const completion = mode === 'complete' && params.itemId ? completionRequest(value, params.itemId) : null
      const saved = await withFreshSession((api) => {
        if (mode === 'edit' && params.eventId) {
          return api.changeHealthEvent(petId, params.eventId, eventPatch(value, keptDate))
        }
        if (completion) {
          return api.completeHealthItem(petId, completion.itemId, completion.input, requestKey.current)
        }
        // readDraft builds the request whole; re-picking fields here once dropped product_id.
        return api.createHealthEvent(petId, value, requestKey.current)
      })
      if (completion) {
        // A 200 is not success by itself: an item already done — a retry after
        // a lost answer, another device — is answered with the record as it
        // was first saved. The same check as the site's (completionMismatch,
        // packages/shared); the next plan is compared when the record can be
        // read again, otherwise the day alone decides.
        const events = await withFreshSession((api) => api.getHealthOverview(petId, localToday())).then(
          (overview) => overview.events,
          () => null,
        )
        const mismatch = completionMismatch(completion.input, saved, completion.itemId, events)
        if (mismatch) {
          void recordChanged(petId)
          const day = t.day(saved.date, true)
          // The item is done as first saved: this form cannot change it, so it
          // is closed, and the way out asks nothing.
          const text = mismatch === 'doneOn' ? words.earlierDone(day) : words.earlierNext(day)
          unsaved.leave(() => setLocked({ text, tone: 'error', record: saved.id }))
          return
        }
      }
      void recordChanged(petId)
      const plan = mode === 'edit' ? null : plannedItem(value)
      if (plan) reminders.planSaved(plan)
      unsaved.leave(then)
    } catch (cause) {
      // The first try was saved after all, with what it said then; the change
      // since is not. Say so rather than let the person think it went in.
      if (cause instanceof ApiError && cause.code === 'conflict') {
        setError({ text: words.alreadySaved, offline: false })
      } else if (cause instanceof ApiError && cause.code === 'record_done') {
        // Done meanwhile (another device): history now, nothing to save or to ask about.
        unsaved.leave(() => setLocked({ text: t.errors.recordDone, tone: 'info' }))
      } else {
        setError(describeFailure(t, cause, words.saveEventFailed))
      }
    } finally {
      setBusy(false)
    }
  }

  return {
    kind,
    species,
    draft,
    errors,
    error,
    locked,
    busy,
    recordDay,
    showNext,
    summary,
    unsaved,
    load,
    change,
    updateItem,
    addItem,
    save,
  }
}
