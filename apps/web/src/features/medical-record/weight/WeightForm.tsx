'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { WeightMeasurement } from '@lapka/contracts'
import { newWeightInput, weightCorrection, weightFieldText } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { recordCache } from '../record-load'
import { medicalRecordHref } from '../stage'
import { formatDay, formatWeight } from '../view-model'
import { fieldErrors, saveFailure, saveFailureText, type FieldErrors } from './weight-form'
import type { WeightSaved } from './weight-view'

/**
 * Adding a weighing or correcting one (web v1, «weight-new», «weight-edit»).
 *
 * The fields are read by the shared rules (the contract's bounds, one
 * decimal, «4,2» = 4.2, no day after today). Saving: the button says it is
 * saving and a second press does nothing; a failure keeps every field as
 * typed and says why, and the button works again. Only when the server has
 * the change does the page go back to the weight history, which loads it
 * fresh — and so do the record's head and the pet form, which the server
 * keeps on the latest measurement.
 *
 * A retry needs no idempotency key here: a weighing is stored per day (a
 * second save for the day replaces its value) and a correction sets values,
 * so sending the same save twice leaves the same history (see the stage
 * report). Deleting a measurement that is already gone counts as done.
 */
export default function WeightForm({
  petId,
  petName,
  editing,
  today,
}: {
  petId: string
  petName: string
  /** The measurement being corrected; null for a new one. */
  editing: WeightMeasurement | null
  /** The owner's calendar day: the latest a weighing can be. */
  today: string
}) {
  const dict = useTranslations()
  const router = useRouter()
  const words = dict.medicalRecord
  const form = words.weightForm
  const id = useId()
  const historyHref = medicalRecordHref.section(petId, 'weight')

  const initial = {
    weight: editing ? weightFieldText(editing.weight_kg, words.decimalSeparator) : '',
    // The form's undated weight opens with an empty day, not today's: its day is unknown.
    day: editing ? (editing.measured_on ?? '') : today,
  }
  const [weightText, setWeightText] = useState(initial.weight)
  const [day, setDay] = useState(initial.day)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | undefined>()

  const inFlight = useRef(false)
  const weightRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)

  const dirty = weightText !== initial.weight || day !== initial.day
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving && !deleting)

  const undated = editing !== null && editing.measured_on === null
  // The measurement by name in the delete question: «4,2 кг, 12 сентября 2026».
  const deleteTitle = editing
    ? form.deleteTitle
        .replace('{weight}', formatWeight(words, editing.weight_kg))
        .replace('{day}', editing.measured_on ? formatDay(words, editing.measured_on, true) : words.weightPage.noDate.toLowerCase())
    : ''

  /** The history, freshly loaded: the page does not show what it had before the change. */
  function done(saved: WeightSaved) {
    recordCache.forget(petId)
    leave(`${historyHref}?saved=${saved}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return

    const read = editing ? weightCorrection(editing, weightText, day, today) : newWeightInput(weightText, day, today)
    if (!read.ok) {
      const next = fieldErrors(dict, read.problems)
      setErrors(next)
      setBanner(null)
      ;(next.weight ? weightRef : dayRef).current?.focus()
      return
    }
    // Nothing changed: there is nothing to save, and nothing to confirm.
    if (editing && 'patch' in read && read.patch === null) {
      leave(historyHref)
      return
    }

    inFlight.current = true
    setSaving(true)
    setErrors({})
    setBanner(null)
    try {
      const api = browserApi()
      if (editing && 'patch' in read && read.patch) await api.changeWeight(petId, editing.id, read.patch)
      else if ('input' in read) await api.addWeight(petId, read.input)
      done(editing ? 'changed' : 'added')
    } catch (error) {
      inFlight.current = false
      setSaving(false)
      const failure = saveFailure(error)
      if (failure !== 'offline') console.warn('[medical-record] weight save failed', error)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
      } else if (failure === 'dayTaken') {
        setErrors({ day: form.errors.dayTaken })
        dayRef.current?.focus()
      } else {
        setBanner(saveFailureText(dict, failure))
      }
    }
  }

  async function handleDelete() {
    if (!editing || inFlight.current) return
    inFlight.current = true
    setDeleting(true)
    setDeleteError(undefined)
    try {
      await browserApi().deleteWeight(petId, editing.id)
      done('deleted')
    } catch (error) {
      const failure = saveFailure(error)
      // Already gone — deleted on another device, or an earlier attempt whose answer was lost.
      if (failure === 'gone') {
        done('deleted')
        return
      }
      inFlight.current = false
      setDeleting(false)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      if (failure !== 'offline') console.warn('[medical-record] weight delete failed', error)
      setDeleteError(failure === 'offline' || failure === 'signedOut' ? saveFailureText(dict, failure) : form.errors.deleteFailed)
    }
  }

  const weightErrorId = `${id}-weight-error`
  const dayErrorId = `${id}-day-error`
  const dayHintId = `${id}-day-hint`

  return (
    <div className="health-page weight-form-page">
      <div className="pagehead">
        <div>
          <h1>{editing ? form.editTitle : form.addTitle}</h1>
          <p>{petName}</p>
        </div>
        <Link href={historyHref} className="link">
          <Icon name="back" />
          {form.backToHistory}
        </Link>
      </div>

      <form className="card record-form weight-form" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-weight`}>{form.weightField}</label>
          <input
            ref={weightRef}
            id={`${id}-weight`}
            className="input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={weightText}
            readOnly={saving}
            aria-required="true"
            aria-invalid={errors.weight ? true : undefined}
            aria-describedby={errors.weight ? weightErrorId : undefined}
            onChange={(e) => {
              setWeightText(e.target.value)
              if (errors.weight) setErrors((current) => ({ ...current, weight: undefined }))
            }}
          />
          {errors.weight && <span id={weightErrorId} className="field-error" role="alert">{errors.weight}</span>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${id}-day`}>{form.dayField}</label>
          <input
            ref={dayRef}
            id={`${id}-day`}
            className="input"
            type="date"
            max={today}
            value={day}
            readOnly={saving}
            aria-required={undated ? undefined : 'true'}
            aria-invalid={errors.day ? true : undefined}
            aria-describedby={[errors.day ? dayErrorId : null, dayHintId].filter(Boolean).join(' ')}
            onChange={(e) => {
              setDay(e.target.value)
              if (errors.day) setErrors((current) => ({ ...current, day: undefined }))
            }}
          />
          {errors.day && <span id={dayErrorId} className="field-error" role="alert">{errors.day}</span>}
          <span id={dayHintId} className="field-hint">
            {undated ? form.undatedHint : editing ? form.editHint : form.newHint}
          </span>
        </div>

        {banner && <p className="banner error record-form-error" role="alert">{banner}</p>}

        <div className="form-actions">
          <Link href={historyHref} className="link">{form.cancel}</Link>
          <button
            type="submit"
            className="btn primary"
            // Not `disabled`: the pressed button keeps focus, and works again after a failure.
            aria-disabled={saving || undefined}
          >
            {saving ? form.saving : form.save}
          </button>
        </div>

        {editing && (
          <button
            ref={deleteRef}
            type="button"
            className="link danger record-form-delete"
            onClick={() => {
              setDeleteError(undefined)
              setConfirmDelete(true)
            }}
            disabled={saving}
          >
            {form.delete}
          </button>
        )}
      </form>

      {confirmDelete && editing && (
        <ConfirmDialog
          title={deleteTitle}
          body={form.deleteBody}
          cancelLabel={form.keep}
          confirmLabel={form.deleteConfirm}
          busyLabel={form.deleting}
          busy={deleting}
          error={deleteError}
          tone="danger"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          returnFocusRef={deleteRef}
        />
      )}

      {leaveHref && (
        <ConfirmDialog
          title={form.leaveTitle}
          body={form.leaveBody}
          cancelLabel={form.leaveStay}
          confirmLabel={form.leaveConfirm}
          onCancel={stay}
          onConfirm={() => leave(leaveHref)}
          returnFocusRef={leaveLinkRef}
        />
      )}
    </div>
  )
}
