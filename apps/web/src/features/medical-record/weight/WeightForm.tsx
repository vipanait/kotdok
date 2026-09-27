'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { WeightMeasurement } from '@lapka/contracts'
import { weightFieldText } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import { useSaveKey } from '@/features/forms/save-key'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { recordCache } from '../record-load'
import { medicalRecordHref } from '../routes'
import { formatDay, formatWeight } from '../view-model'
import { saveFailure, saveFailureText, weightFailureView, weightSaveStep, type FieldErrors } from './weight-form'
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
 * One Idempotency-Key per form (`useSaveKey`), as the other record forms:
 * a retry — a second press, «нет связи», a lost answer, even after midnight —
 * is the same save, and the server keeps one measurement. If an earlier try
 * did land and the fields changed since, the server answers that the key was
 * used for other data, and the form says the measurement was already saved.
 * Deleting a measurement that is already gone counts as done.
 */
export default function WeightForm({
  petId,
  petName,
  editing,
  today,
  formWeight = null,
  onDirtyChange,
  notice = null,
}: {
  petId: string
  petName: string
  /** The measurement being corrected; null for a new one. */
  editing: WeightMeasurement | null
  /** The owner's calendar day: the latest a weighing can be. */
  today: string
  /**
   * A new weighing that dates the pet form's weight («Уточнить» with no
   * history): it starts from that value and an empty day. Saved with that
   * value, it is the one measurement, not a second one beside it.
   */
  formWeight?: number | null
  /** Whether the owner has typed (or is saving): a page refreshing the measurement keeps the form as it is while so. */
  onDirtyChange?: (dirty: boolean) => void
  /** What became of the measurement meanwhile, under the heading. */
  notice?: React.ReactNode
}) {
  const dict = useTranslations()
  const router = useRouter()
  const words = dict.medicalRecord
  const form = words.weightForm
  const id = useId()
  const historyHref = medicalRecordHref.section(petId, 'weight')

  const dating = editing === null && formWeight !== null
  // Fixed when the form opens: a new day at midnight moves the limits, not what the form started from.
  const [initial] = useState(() => ({
    weight: editing
      ? weightFieldText(editing.weight_kg, words.decimalSeparator)
      : formWeight !== null
        ? weightFieldText(formWeight, words.decimalSeparator)
        : '',
    // The form's undated weight opens with an empty day, not today's: its day is unknown.
    day: editing ? (editing.measured_on ?? '') : dating ? '' : today,
  }))
  const [weightText, setWeightText] = useState(initial.weight)
  const [day, setDay] = useState(initial.day)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | undefined>()
  const saveKey = useSaveKey()

  const inFlight = useRef(false)
  const weightRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)

  const dirty = weightText !== initial.weight || day !== initial.day
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving && !deleting)
  useEffect(() => onDirtyChange?.(dirty || saving || deleting), [dirty, saving, deleting, onDirtyChange])

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

    const next = weightSaveStep(dict, { editing, weightText, day, today, formWeight })
    if (next.step === 'invalid') {
      setErrors(next.errors)
      setBanner(null)
      ;(next.focus === 'weight' ? weightRef : dayRef).current?.focus()
      return
    }
    // Nothing changed: there is nothing to save, and nothing to confirm.
    if (next.step === 'unchanged') {
      leave(historyHref)
      return
    }

    inFlight.current = true
    setSaving(true)
    setErrors({})
    setBanner(null)
    try {
      const api = browserApi()
      if (next.step === 'change' && editing) await api.changeWeight(petId, editing.id, next.patch, saveKey.current())
      else if (next.step === 'add') await api.addWeight(petId, next.input, saveKey.current())
      done(editing ? 'changed' : 'added')
    } catch (error) {
      inFlight.current = false
      setSaving(false)
      const failure = saveFailure(error)
      if (failure !== 'offline') console.warn('[medical-record] weight save failed', error)
      const view = weightFailureView(dict, failure)
      if ('leave' in view) {
        router.replace(view.leave)
      } else if ('dayError' in view) {
        setErrors({ day: view.dayError })
        dayRef.current?.focus()
      } else {
        setBanner(view.banner)
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

      {notice}

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
            {undated ? form.undatedHint : dating ? form.datingHint : editing ? form.editHint : form.newHint}
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
