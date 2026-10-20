'use client'

import { useId, useRef, useState } from 'react'
import type { Medication } from '@lapka/contracts'
import { editTime } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { eventSaveFailure } from '../events/event-form'
import { addTypedTime, presetTimes, togglePreset, type TimesChange } from './dose-times-field'

/**
 * «Время приёма» (FB-5/01, design `medication`): tick the usual times or
 * type one into «Своё время» and press «+» («Добавить время»). Every change
 * sends the whole list, as the API replaces it, and shows it once the
 * server took it; a refusal or a lost connection leaves the times as they
 * were. The site sends no notifications: the phone's app reminds, and picks
 * the new times up when it is opened.
 */
export default function DoseTimesField({
  petId,
  course,
  editable,
  onSaved,
}: {
  petId: string
  course: Medication
  /** A finished course keeps its times only to read. */
  editable: boolean
  onSaved: (course: Medication) => void
}) {
  const t = useTranslations().medicalRecord.doseTimes
  const id = useId()
  const [times, setTimes] = useState(course.reminder_times)
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const inFlight = useRef(false)

  async function save(change: TimesChange, typedField: boolean) {
    if (inFlight.current) return
    if (!change.ok) {
      setProblem(t.errors[change.reason])
      return
    }
    inFlight.current = true
    setBusy(true)
    setProblem('')
    setSavedNote(false)
    try {
      const saved = await browserApi().setMedicationTimes(petId, course.id, change.times)
      setTimes(saved.reminder_times)
      if (typedField) setTyped('')
      setSavedNote(true)
      onSaved(saved)
    } catch (error) {
      const failure = eventSaveFailure(error)
      setProblem(failure === 'offline' ? t.errors.offline : t.errors.failed)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const problemId = `${id}-problem`
  const noteId = `${id}-note`

  return (
    <section className="card dose-times" aria-labelledby={`${id}-title`} aria-busy={busy || undefined}>
      <h2 id={`${id}-title`}>{t.title}</h2>
      {editable ? (
        <>
          <p className="muted">{t.body}</p>
          <div className="chips" role="group" aria-labelledby={`${id}-title`}>
            {presetTimes(times).map((time) => (
              <button
                key={time}
                type="button"
                className="chip"
                aria-pressed={times.includes(time)}
                aria-disabled={busy || undefined}
                onClick={() => void save(togglePreset(times, time), false)}
              >
                {time}
              </button>
            ))}
          </div>

          <form
            className="field"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void save(addTypedTime(times, typed), true)
            }}
          >
            <label className="field-label" htmlFor={`${id}-custom`}>
              {t.custom}
            </label>
            <div className="time-add">
              <input
                id={`${id}-custom`}
                className="input"
                inputMode="numeric"
                autoComplete="off"
                placeholder="07:30"
                value={typed}
                onChange={(event) => {
                  setTyped(editTime(typed, event.target.value))
                  setProblem('')
                }}
                aria-invalid={problem ? true : undefined}
                aria-describedby={[problem ? problemId : null, noteId].filter(Boolean).join(' ')}
              />
              <button type="submit" className="time-add-button" aria-label={t.add} aria-disabled={busy || undefined}>
                <Icon name="plus" />
              </button>
            </div>
            {problem && (
              <span id={problemId} className="field-error" role="alert">
                {problem}
              </span>
            )}
          </form>
          {savedNote && (
            <p className="field-hint dose-times-saved" role="status">
              {t.saved}
            </p>
          )}
        </>
      ) : (
        <p className="muted">{times.length > 0 ? times.join(', ') : t.none}</p>
      )}

      <small id={noteId} className="field-hint">
        {t.note}
      </small>
      <div className="dose-times-notice">
        <Icon name="info" />
        <p>{t.phoneNote}</p>
      </div>
    </section>
  )
}
