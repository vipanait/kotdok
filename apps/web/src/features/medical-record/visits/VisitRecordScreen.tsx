'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { localToday } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import { browserApi } from '@/features/api/browser-api'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import { recordCache } from '../record-load'
import SavedNotice from '../SavedNotice'
import { useMedicalRecord } from '../use-medical-record'
import { eventSaveFailure } from '../events/event-form'
import { usePetChecks } from './use-pet-checks'
import { visitRecord, type VisitSaved } from './visit-view'
import { VisitGone } from './VisitFormScreen'

/**
 * One visit (web v1 «visit-record», «visit-planned»). A plan has
 * «Состоялся», which opens its own step, and «Изменить», which also moves
 * it; «Отменить план» asks first, naming it. A visit that happened is only
 * read — no «Изменить», and its edit address shows this page (owner rule of
 * 26 September 2026); deleting it asks first. A prescription of a visit
 * that happened can go to the medicines here, once: the server starts one
 * course per prescription however often it is asked. A visit that followed
 * a check leads back to it.
 */
export default function VisitRecordScreen({ petId, visitId, saved }: { petId: string; visitId: string; saved: VisitSaved | null }) {
  const dict = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const words = dict.medicalRecord
  const view = words.visitRecord
  const { state, reload } = useMedicalRecord(petId)
  const checks = usePetChecks(petId)
  const [today] = useState(() => localToday())
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | undefined>()
  const [adding, setAdding] = useState<string | null>(null)
  const [addError, setAddError] = useState<{ id: string; text: string } | null>(null)
  const [added, setAdded] = useState(false)
  const removeRef = useRef<HTMLButtonElement>(null)
  const inFlight = useRef(false)

  // A course was started: read the record again, so the prescription shows it.
  useEffect(() => {
    if (!added) return
    recordCache.forget(petId)
    reload()
    // Once per addition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [added])

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<RecordSkeleton label={words.states.loading} />} />
  }

  const visit = state.data.overview.events.find((entry) => entry.id === visitId)
  if (!visit || visit.kind !== 'visit') return <VisitGone petId={petId} />
  const record = visitRecord(dict, locale, petId, visit, checks.items, today, state.data.overview.writable)
  const planned = record.status === 'planned'

  function failureText(error: unknown, fallback: string): string | null {
    const failure = eventSaveFailure(error)
    if (failure === 'deleting') {
      router.replace('/account-deletion')
      return null
    }
    if (failure !== 'offline') console.warn('[medical-record] visit action failed', error)
    return failure === 'offline' || failure === 'signedOut' ? words.visitForm.errors[failure] : fallback
  }

  function gone() {
    recordCache.forget(petId)
    router.push(`${record.sectionHref}?saved=${planned ? 'cancelled' : 'deleted'}`)
    router.refresh()
  }

  async function remove() {
    if (inFlight.current) return
    inFlight.current = true
    setRemoving(true)
    setRemoveError(undefined)
    try {
      await browserApi().deleteHealthEvent(petId, visitId)
      gone()
    } catch (error) {
      // Already gone: deleted elsewhere, or an earlier attempt whose answer was lost.
      if (eventSaveFailure(error) === 'gone') {
        gone()
        return
      }
      inFlight.current = false
      setRemoving(false)
      const text = failureText(error, view.deleteFailed)
      if (text) setRemoveError(text)
    }
  }

  /** «Добавить в лекарства»: the server starts the course once, however often it is asked. */
  async function toMedicines(itemId: string) {
    if (inFlight.current) return
    inFlight.current = true
    setAdding(itemId)
    setAddError(null)
    setAdded(false)
    try {
      await browserApi().prescriptionToMedication(petId, itemId)
      inFlight.current = false
      setAdding(null)
      setAdded(true)
      // «Принимает сейчас», the pet form and the summary read the server anew.
      router.refresh()
    } catch (error) {
      inFlight.current = false
      setAdding(null)
      // The prescription or the visit is gone meanwhile: the page says so once read again.
      if (eventSaveFailure(error) === 'gone') {
        recordCache.forget(petId)
        reload()
        return
      }
      const text = failureText(error, view.addFailed)
      if (text) setAddError({ id: itemId, text })
    }
  }

  return (
    <div className="health-page event-record-page visit-record-page">
      <Link href={record.sectionHref} className="link health-back">
        <Icon name="back" />
        {view.back}
      </Link>

      <div className="pagehead">
        <div>
          <h1>{view.title}</h1>
          <p>{state.data.overview.pet.name}</p>
        </div>
        {(record.heldHref || record.editHref) && (
          <div className="pagehead-actions">
            {record.heldHref && <Link href={record.heldHref} className="btn primary">{view.markHeld}</Link>}
            {record.editHref && <Link href={record.editHref} className="btn secondary">{view.edit}</Link>}
          </div>
        )}
      </div>

      {added ? <SavedNotice text={view.added} /> : saved && <SavedNotice text={words.visitsPage.saved[saved]} />}
      <StaleNotice state={state} reload={reload} />

      <div className="section-layout">
        <div className="section-main">
          <section className="card event-record-head" aria-labelledby="visit-record-day">
            <span className={planned ? 'pill event-badge planned' : 'pill event-badge'}>{record.badge}</span>
            <h2 id="visit-record-day">{record.day}</h2>
            <p>{record.kind}</p>
            {record.due && <p className={`event-due ${record.due.tone}`}>{record.due.text}</p>}
          </section>

          <section className="card visit-record-body" aria-label={view.title}>
            <dl className="visit-facts">
              {record.clinic && (
                <div>
                  <dt>{view.clinic}</dt>
                  <dd>{record.clinic}</dd>
                </div>
              )}
              {record.reason && (
                <div>
                  <dt>{view.reason}</dt>
                  <dd>{record.reason}</dd>
                </div>
              )}
              {record.diagnosis && (
                <div>
                  <dt>{view.diagnosis}</dt>
                  <dd>{record.diagnosis}</dd>
                </div>
              )}
            </dl>

            {record.prescriptions.length > 0 && (
              <div className="visit-prescriptions">
                <h3>{view.prescriptions}</h3>
                <ul>
                  {record.prescriptions.map((item) => (
                    <li key={item.id}>
                      <div className="visit-prescription-copy">
                        <strong>{item.name}</strong>
                        {item.instructions && <span>{item.instructions}</span>}
                      </div>
                      {item.courseHref ? (
                        <Link
                          href={item.courseHref}
                          className="link visit-prescription-action"
                          aria-label={view.inMedicinesLabel.replace('{name}', item.name)}
                        >
                          {view.inMedicines}
                        </Link>
                      ) : item.addable ? (
                        <button
                          type="button"
                          className="link visit-prescription-action"
                          aria-label={view.toMedicinesLabel.replace('{name}', item.name)}
                          aria-disabled={adding !== null || undefined}
                          onClick={() => void toMedicines(item.id)}
                        >
                          {adding === item.id ? view.adding : view.toMedicines}
                        </button>
                      ) : null}
                      {addError?.id === item.id && (
                        <span className="field-error" role="alert">{addError.text}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {record.coursesHref && <Link href={record.coursesHref} className="link">{view.toCourses}</Link>}
              </div>
            )}

            {record.notes && (
              <div className="event-record-notes">
                <h3>{view.notes}</h3>
                <p>{record.notes}</p>
              </div>
            )}
          </section>

          {record.check && (
            <Link
              href={record.check.href}
              className="card visit-check-link"
              aria-label={view.checkLink.replace('{text}', [record.check.text, record.check.urgencyText].filter(Boolean).join(', '))}
            >
              <span className="visit-check-title">{view.check}</span>
              <span className="visit-card-check">
                {record.check.urgency && <UrgencyBadge urgency={record.check.urgency} dict={dict} />}
                <span>{record.check.text}</span>
              </span>
              <Icon name="arrow" />
            </Link>
          )}
        </div>

        <aside className="section-aside">
          <div className="card health-facts event-actions">
            <h2>{view.actionsTitle}</h2>
            <p>{record.actionsBody}</p>
            {record.removable && (
              <button
                ref={removeRef}
                type="button"
                className="btn secondary"
                onClick={() => {
                  setRemoveError(undefined)
                  setAsking(true)
                }}
              >
                {planned ? view.cancelPlan : view.delete}
              </button>
            )}
          </div>
        </aside>
      </div>

      {asking && (
        <ConfirmDialog
          title={record.removeTitle}
          body={planned ? view.cancelBody : view.deleteBody}
          cancelLabel={planned ? view.keepPlan : view.keep}
          confirmLabel={planned ? view.cancelConfirm : view.deleteConfirm}
          busyLabel={view.deleting}
          busy={removing}
          error={removeError}
          tone="danger"
          onCancel={() => setAsking(false)}
          onConfirm={remove}
          returnFocusRef={removeRef}
        />
      )}
    </div>
  )
}

function RecordSkeleton({ label }: { label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="section-layout" aria-hidden>
        <div className="skeleton-block weight-skeleton-main" />
        <div className="skeleton-block weight-skeleton-aside" />
      </div>
    </div>
  )
}
