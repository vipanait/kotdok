'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { VISIT_KINDS, VISIT_LIMITS, type HealthEvent, type SymptomCheckRecord } from '@lapka/contracts'
import { linkableChecks, reasonFromCheck } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import { browserApi } from '@/features/api/browser-api'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import { useSaveKey } from '@/features/forms/save-key'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { urgencyTitle } from '@/shared/utils/urgency'
import { recordCache } from '../record-load'
import { medicalRecordHref } from '../stage'
import { recordDay } from '../view-model'
import { eventSaveFailure, type EventSaveFailure } from '../events/event-form'
import {
  blankPrescription,
  blankVisit,
  draftFromPlan,
  heldDraft,
  readHeld,
  readNewVisit,
  readPlanChange,
  savesHeldVisit,
  switchVisitStatus,
  visitDraftChanged,
  type PrescriptionDraft,
  type ReadVisit,
  type VisitDraft,
  type VisitProblems,
  type VisitSource,
} from './visit-form'
import { visitErrorTexts } from './visit-form-text'
import { checkDayOf, type CheckLink } from './visit-view'

type Banner = Exclude<EventSaveFailure, 'deleting'>

/** How the form was opened: a new visit, a plan to change, or a plan that happened. */
export type VisitFormMode =
  | { kind: 'new'; source: (VisitSource & { link: CheckLink }) | null }
  | { kind: 'edit'; plan: HealthEvent }
  | { kind: 'held'; plan: HealthEvent }

/**
 * A vet visit — web v1 «visit-done», «visit-plan», «visit-prescriptions»,
 * «visit-from-result», «visit-plan-edit», «visit-complete».
 *
 * «Был» / «Запланировать» for a new visit; a plan is changed or moved on its
 * own, and «Состоялся» is a step of its own with the done-is-final warning
 * and «Подтвердить визит». Diagnosis (optional, several lines) and
 * «Назначения» belong to a visit that happened: one heading, prescriptions
 * added one at a time and empty, each removed by its own ×, and «Добавить в
 * лекарства» ticked on a new one (spec §7.11) — the owner unticks it before
 * saving. From a check result the check is
 * linked and said; otherwise the owner may pick one of the pet's checks of
 * the last 30 days, and a plan keeps the link it has, however old.
 *
 * Saving: one Idempotency-Key per form (`useSaveKey`), so pressing again or
 * retrying after «нет связи» or a lost answer never makes a second visit,
 * second prescriptions or second courses. A failure keeps every field and
 * says why beside the button, which works again. A plan found done or gone
 * meanwhile is read again (`onStale`): the page then says so.
 */
export default function VisitForm({
  petId,
  petName,
  mode,
  checks,
  today,
  backHref,
  doneHref,
  onStale,
}: {
  petId: string
  petName: string
  mode: VisitFormMode
  /** The pet's checks, newest first: what the check choice offers. */
  checks: readonly SymptomCheckRecord[]
  today: string
  /** Where «Назад» and «Отмена» lead. */
  backHref: string
  /** Where a saved visit leads: given its id and what happened. */
  doneHref: (visitId: string, saved: 'added' | 'changed' | 'held') => string
  /** The plan changed under the form (done or gone): read the record again. */
  onStale: () => void
}) {
  const dict = useTranslations()
  const router = useRouter()
  const words = dict.medicalRecord
  const form = words.visitForm
  const id = useId()
  const saveKey = useSaveKey()
  const nextKey = useRef(1)

  const [initial] = useState<VisitDraft>(() =>
    mode.kind === 'new' ? blankVisit(today, mode.source) : mode.kind === 'edit' ? draftFromPlan(mode.plan) : heldDraft(mode.plan, today),
  )
  const [draft, setDraft] = useState<VisitDraft>(initial)
  const [problems, setProblems] = useState<VisitProblems>({})
  const [banner, setBanner] = useState<Banner | null>(null)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const addRef = useRef<HTMLButtonElement>(null)

  const dirty = visitDraftChanged(initial, draft)
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving)
  const errors = visitErrorTexts(dict, problems)
  const done = draft.status === 'done'
  const full = draft.prescriptions.length >= VISIT_LIMITS.prescriptions
  const plan = mode.kind === 'new' ? null : mode.plan
  const source = mode.kind === 'new' ? mode.source : null

  // The check choice: the pet's checks of the last 30 days, and the one the visit already has.
  const linked = plan?.check_id ?? null
  const choices = source ? [] : linkableChecks(checks, today, linked, checkDayOf)
  const linkedMissing = linked !== null && !choices.some((check) => check.id === linked)

  function update(patch: Partial<VisitDraft>, cleared: (keyof VisitProblems)[] = []) {
    setDraft((current) => ({ ...current, ...patch }))
    if (cleared.length > 0) {
      setProblems((current) => {
        const rest = { ...current }
        for (const field of cleared) delete rest[field]
        return rest
      })
    }
  }

  function updatePrescription(key: string, patch: Partial<PrescriptionDraft>) {
    setDraft((current) => ({
      ...current,
      prescriptions: current.prescriptions.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }))
    setProblems((current) => {
      if (!current.prescription?.[key]) return current
      const rest = { ...current.prescription }
      delete rest[key]
      return { ...current, prescription: rest }
    })
  }

  function addPrescription() {
    const key = `new-${nextKey.current++}`
    setDraft((current) => ({ ...current, prescriptions: [...current.prescriptions, blankPrescription(key)] }))
    setProblems((current) => ({ ...current, prescriptions: undefined }))
    window.setTimeout(() => document.getElementById(`${id}-${key}-name`)?.focus(), 0)
  }

  function removePrescription(key: string) {
    const index = draft.prescriptions.findIndex((item) => item.key === key)
    const rest = draft.prescriptions.filter((item) => item.key !== key)
    setDraft((current) => ({ ...current, prescriptions: current.prescriptions.filter((item) => item.key !== key) }))
    // Focus does not fall to the page: the next prescription's name, or «Добавить назначение».
    const next = rest[index] ?? null
    window.setTimeout(() => {
      if (next) document.getElementById(`${id}-${next.key}-name`)?.focus()
      else addRef.current?.focus()
    }, 0)
  }

  /** Where the first problem is, so focus lands on it. */
  function firstProblemId(found: VisitProblems): string | null {
    if (found.date) return `${id}-date`
    if (found.texts?.includes('clinic')) return `${id}-clinic`
    if (found.texts?.includes('reason')) return `${id}-reason`
    if (found.texts?.includes('diagnosis')) return `${id}-diagnosis`
    for (const item of draft.prescriptions) {
      const own = found.prescription?.[item.key]
      if (own?.name) return `${id}-${item.key}-name`
      if (own?.instructions) return `${id}-${item.key}-instructions`
    }
    if (found.texts?.includes('notes')) return `${id}-notes`
    return null
  }

  /** The request this form would send (none when a plan was not changed), or what is wrong. */
  function prepare(): ReadVisit<(() => Promise<HealthEvent>) | null> {
    if (mode.kind === 'new') {
      const read = readNewVisit(draft, today)
      return read.ok ? { ok: true, value: () => browserApi().createVisit(petId, read.value, saveKey.current()) } : read
    }
    const planId = mode.plan.id
    const read = mode.kind === 'edit' ? readPlanChange(mode.plan, draft, today) : readHeld(mode.plan, draft, today)
    if (!read.ok) return read
    const patch = read.value
    return { ok: true, value: patch === null ? null : () => browserApi().changeVisit(petId, planId, patch, saveKey.current()) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return

    const read = prepare()
    if (!read.ok && read.rejected) {
      setProblems({})
      setBanner('rejected')
      console.warn('[medical-record] the visit form built a request the contract refuses')
      return
    }
    if (!read.ok) {
      setProblems(read.problems)
      setBanner(null)
      const target = firstProblemId(read.problems)
      if (target) document.getElementById(target)?.focus()
      return
    }
    // Nothing changed: nothing to save.
    if (read.value === null) {
      leave(backHref)
      return
    }

    inFlight.current = true
    setSaving(true)
    setProblems({})
    setBanner(null)
    try {
      const saved = await read.value()
      // The next save of this form would be a new one.
      saveKey.renew()
      recordCache.forget(petId)
      leave(doneHref(saved.id, mode.kind === 'new' ? 'added' : mode.kind === 'edit' ? 'changed' : 'held'))
    } catch (error) {
      inFlight.current = false
      setSaving(false)
      const failure = eventSaveFailure(error)
      if (failure !== 'offline') console.warn('[medical-record] visit save failed', error)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      // The plan was marked held or removed meanwhile: read it again; the page says what it is now.
      if (plan && (failure === 'done' || failure === 'gone')) {
        recordCache.forget(petId)
        onStale()
        return
      }
      // Beside the button (role=alert); focus stays on it for the retry.
      setBanner(failure)
    }
  }

  const title = mode.kind === 'new' ? form.addTitle : mode.kind === 'edit' ? form.editTitle : form.heldTitle
  // «23 сентября · Срочно · Хромает на левую лапу»: the first line of what the owner described.
  const checkText = (check: SymptomCheckRecord) => {
    const line = reasonFromCheck(check.symptoms_input)
    return form.checkOption
      .replace('{day}', recordDay(words, checkDayOf(check.created_at), today))
      .replace('{urgency}', urgencyTitle(dict.urgency[check.urgency]?.label))
      .replace('{text}', line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line)
  }

  const checkBlock = source ? (
    <div className="banner visit-form-check" id={`${id}-check`}>
      <UrgencyBadge urgency={source.link.urgency} dict={dict} />
      <span>{source.link.text}</span>
    </div>
  ) : choices.length > 0 || linkedMissing ? (
    <div className="field">
      <label className="field-label" htmlFor={`${id}-check`}>
        {form.check}
        <span className="optional">{form.optional}</span>
      </label>
      <select
        id={`${id}-check`}
        className="input"
        value={draft.checkId ?? ''}
        disabled={saving}
        aria-describedby={`${id}-check-hint`}
        onChange={(e) => update({ checkId: e.target.value === '' ? null : e.target.value })}
      >
        <option value="">{form.noCheck}</option>
        {linkedMissing && linked && <option value={linked}>{words.visitsPage.linkedCheck}</option>}
        {choices.map((check) => (
          <option key={check.id} value={check.id}>{checkText(check)}</option>
        ))}
      </select>
      <span id={`${id}-check-hint`} className="field-hint">{form.checkHint}</span>
    </div>
  ) : null

  return (
    <div className="health-page event-form-page visit-form-page">
      <div className="pagehead">
        <div>
          <h1>{title}</h1>
          <p>{petName}</p>
        </div>
        <Link href={backHref} className="link">
          <Icon name="back" />
          {source ? form.toCheck : form.back}
        </Link>
      </div>

      <form className="card record-form event-form visit-form" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        {mode.kind === 'new' && (
          <div className="segmented event-status" role="group" aria-label={form.statusLabel}>
            {(['done', 'planned'] as const).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={draft.status === status}
                disabled={saving}
                onClick={() => update(switchVisitStatus(draft, status, today), ['date', 'texts', 'prescription', 'prescriptions'])}
              >
                {status === 'done' ? form.done : form.planned}
              </button>
            ))}
          </div>
        )}
        {mode.kind === 'held' && <span className="pill event-badge visit-held-badge">{form.heldBadge}</span>}

        <div className="field">
          <label className="field-label" htmlFor={`${id}-kind`}>{form.kind}</label>
          <select
            id={`${id}-kind`}
            className="input"
            value={draft.visitKind}
            disabled={saving}
            onChange={(e) => update({ visitKind: e.target.value as VisitDraft['visitKind'] })}
          >
            {VISIT_KINDS.map((kind) => (
              <option key={kind} value={kind}>{form.kinds[kind]}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${id}-date`}>{done ? form.whenDone : form.whenPlanned}</label>
          <input
            id={`${id}-date`}
            className="input"
            type="date"
            value={draft.date}
            max={done ? today : undefined}
            // A plan moves forward; its own overdue day may stay.
            min={done ? undefined : plan && plan.date < today ? plan.date : today}
            readOnly={saving}
            aria-required="true"
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? `${id}-date-error` : undefined}
            onChange={(e) => update({ date: e.target.value }, ['date'])}
          />
          {errors.date && <span id={`${id}-date-error`} className="field-error" role="alert">{errors.date}</span>}
        </div>

        <TextField
          id={`${id}-clinic`}
          label={form.clinic}
          optional={form.optional}
          value={draft.clinic}
          max={VISIT_LIMITS.clinic}
          error={errors.clinic}
          readOnly={saving}
          onChange={(clinic) => update({ clinic }, ['texts'])}
        />
        <TextField
          id={`${id}-reason`}
          label={form.reason}
          optional={form.optional}
          value={draft.reason}
          max={VISIT_LIMITS.reason}
          error={errors.reason}
          readOnly={saving}
          multiline
          placeholder={form.reasonPlaceholder}
          onChange={(reason) => update({ reason }, ['texts'])}
        />

        {done && (
          <>
            <TextField
              id={`${id}-diagnosis`}
              label={form.diagnosis}
              optional={form.optional}
              value={draft.diagnosis}
              max={VISIT_LIMITS.diagnosis}
              error={errors.diagnosis}
              readOnly={saving}
              multiline
              onChange={(diagnosis) => update({ diagnosis }, ['texts'])}
            />

            <section className="visit-prescriptions-form" aria-labelledby={`${id}-prescriptions`}>
              <h2 id={`${id}-prescriptions`} className="event-items-title">{form.prescriptions}</h2>
              {draft.prescriptions.length > 0 && (
                <ul className="visit-prescription-list">
                  {draft.prescriptions.map((item, index) => {
                    const own = errors.prescription[item.key] ?? {}
                    const name = item.name.trim() || form.prescriptionFallback.replace('{n}', String(index + 1))
                    return (
                      <li key={item.key} className="event-item visit-prescription" aria-label={name}>
                        <div className="event-item-head">
                          <div className="field event-item-name">
                            <label className="field-label" htmlFor={`${id}-${item.key}-name`}>{form.prescriptionName}</label>
                            <input
                              id={`${id}-${item.key}-name`}
                              className="input"
                              type="text"
                              autoComplete="off"
                              maxLength={VISIT_LIMITS.prescriptionName}
                              value={item.name}
                              readOnly={saving}
                              aria-required="true"
                              aria-invalid={own.name ? true : undefined}
                              aria-describedby={own.name ? `${id}-${item.key}-name-error` : undefined}
                              onChange={(e) => updatePrescription(item.key, { name: e.target.value })}
                            />
                            {own.name && <span id={`${id}-${item.key}-name-error`} className="field-error" role="alert">{own.name}</span>}
                          </div>
                          <button
                            type="button"
                            className="icon-button event-item-remove"
                            aria-label={form.removePrescription.replace('{name}', name)}
                            disabled={saving}
                            onClick={() => removePrescription(item.key)}
                          >
                            <Icon name="close" />
                          </button>
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor={`${id}-${item.key}-instructions`}>
                            {form.instructions}
                            <span className="optional">{form.optional}</span>
                          </label>
                          <input
                            id={`${id}-${item.key}-instructions`}
                            className="input"
                            type="text"
                            autoComplete="off"
                            maxLength={VISIT_LIMITS.instructions}
                            placeholder={form.instructionsPlaceholder}
                            value={item.instructions}
                            readOnly={saving}
                            aria-invalid={own.instructions ? true : undefined}
                            aria-describedby={own.instructions ? `${id}-${item.key}-instructions-error` : undefined}
                            onChange={(e) => updatePrescription(item.key, { instructions: e.target.value })}
                          />
                          {own.instructions && (
                            <span id={`${id}-${item.key}-instructions-error`} className="field-error" role="alert">{own.instructions}</span>
                          )}
                        </div>
                        <label className="check-row course-ongoing visit-to-medicines">
                          <input
                            type="checkbox"
                            checked={item.toMedicines}
                            disabled={saving}
                            aria-describedby={`${id}-${item.key}-medicines-hint`}
                            onChange={(e) => updatePrescription(item.key, { toMedicines: e.target.checked })}
                          />
                          {form.toMedicines}
                        </label>
                        <span id={`${id}-${item.key}-medicines-hint`} className="field-hint visit-medicines-hint">{form.toMedicinesHint}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {full ? (
                <p className="field-hint">{form.prescriptionsFull.replace('{max}', String(VISIT_LIMITS.prescriptions))}</p>
              ) : (
                <button ref={addRef} type="button" className="link event-add-item" disabled={saving} onClick={addPrescription}>
                  <Icon name="plus" />
                  {form.addPrescription}
                </button>
              )}
              {errors.prescriptions && <span className="field-error" role="alert">{errors.prescriptions}</span>}
            </section>
          </>
        )}

        {checkBlock}

        <TextField
          id={`${id}-notes`}
          label={form.notes}
          optional={form.optional}
          value={draft.notes}
          max={VISIT_LIMITS.notes}
          error={errors.notes}
          readOnly={saving}
          multiline
          counter={form.counter}
          onChange={(notes) => update({ notes }, ['texts'])}
        />

        {savesHeldVisit(draft) ? (
          <p className="field-hint event-form-warning visit-form-warning">{form.doneWarning}</p>
        ) : mode.kind === 'new' ? (
          <p className="banner event-form-info">{form.planInfo}</p>
        ) : null}

        {/* Beside the button that was pressed, so a long form does not hide it. */}
        {banner && (
          <div className="banner error record-form-error event-form-banner" role="alert">
            <p>{form.errors[banner]}</p>
            {banner === 'alreadySaved' && <Link href={medicalRecordHref.section(petId, 'visits')} className="link">{words.visitsPage.title}</Link>}
          </div>
        )}

        <div className="form-actions">
          <Link href={backHref} className="link">{form.cancel}</Link>
          <button
            type="submit"
            className="btn primary"
            // Not `disabled`: the pressed button keeps focus, and works again after a failure.
            aria-disabled={saving || undefined}
          >
            {saving ? form.saving : mode.kind === 'held' ? form.confirmHeld : form.save}
          </button>
        </div>
      </form>

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

function TextField({
  id,
  label,
  optional,
  value,
  max,
  error,
  readOnly,
  multiline = false,
  placeholder,
  counter,
  onChange,
}: {
  id: string
  label: string
  optional: string
  value: string
  max: number
  error?: string
  readOnly: boolean
  multiline?: boolean
  placeholder?: string
  /** «{n} из {max}» under the field. */
  counter?: string
  onChange: (value: string) => void
}) {
  const describedBy = [error ? `${id}-error` : null, counter ? `${id}-count` : null].filter(Boolean).join(' ') || undefined
  const shared = {
    id,
    className: 'input',
    maxLength: max,
    value,
    placeholder,
    readOnly,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  }
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        <span className="optional">{optional}</span>
      </label>
      {multiline ? (
        <textarea {...shared} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...shared} type="text" autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      )}
      {error && <span id={`${id}-error`} className="field-error" role="alert">{error}</span>}
      {counter && (
        <span id={`${id}-count`} className="field-hint event-counter">
          {counter.replace('{n}', String(value.length)).replace('{max}', String(max))}
        </span>
      )}
    </div>
  )
}
