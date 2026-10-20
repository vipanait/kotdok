'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { visitCalendarHref } from './visit-calendar'
import PetAvatar from '@/components/PetAvatar'
import { medicalRecordHref } from '../routes'
import { headFacts } from '../view-model'

/**
 * One visit (web v1 «visit-record», «visit-planned»; design `visit` of 20
 * October 2026). A plan's main action is «Перенести визит» — its form, where
 * the day moves — and «Визит уже был» opens its own step; the clinic, notes
 * and the rest of the record stay as they are. A plan on today or ahead can
 * go to Google Calendar, which the owner saves there. «Отменить план» asks
 * first, naming it. A visit that happened is only
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
  const { state, reload, today } = useMedicalRecord(petId)
  const checks = usePetChecks(petId)
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | undefined>()
  const [adding, setAdding] = useState<string | null>(null)
  const [addError, setAddError] = useState<{ id: string; text: string } | null>(null)
  /** Courses started from this page so far: each one is its own confirmation. */
  const [added, setAdded] = useState(0)
  const removeRef = useRef<HTMLButtonElement>(null)
  const inFlight = useRef(false)

  // A course was started: read the record again, so the prescription shows it.
  useEffect(() => {
    if (added === 0) return
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
    try {
      await browserApi().prescriptionToMedication(petId, itemId, today)
      inFlight.current = false
      setAdding(null)
      setAdded((count) => count + 1)
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

  const pet = state.data.overview.pet
  const petFacts = headFacts(dict, locale, state.data.overview, today)
  const calendarHref = visitCalendarHref(dict, pet.name, visit, today)
  const when = record.due && record.due.tone === 'soon' ? record.due.text : record.day

  return (
    <div className="health-page event-record-page visit-record-page">
      <Link href={record.sectionHref} className="link health-back">
        <Icon name="back" />
        {view.back}
      </Link>

      <div className="pagehead">
        <div>
          <h1>{view.title}</h1>
          <p>{(planned ? view.planSubtitle : view.doneSubtitle).replace('{name}', () => pet.name)}</p>
        </div>
        <Link href={medicalRecordHref.record(petId)} className="link">
          <Icon name="back" />
          {view.toRecord}
        </Link>
      </div>

      {/* Keyed: every addition is a new notice that takes focus, even over a `?saved=` one or the previous addition's. */}
      {added > 0 ? (
        <SavedNotice key={`added-${added}`} text={view.added} />
      ) : (
        saved && <SavedNotice key={`saved-${saved}`} text={words.visitsPage.saved[saved]} />
      )}
      <StaleNotice state={state} reload={reload} />

      <div className="care-columns visit-columns">
        <div>
          <section className="card visit-record-body" aria-labelledby="visit-record-kind">
            <h2 id="visit-record-kind">{record.kind}</h2>
            <span className={planned ? 'pill event-badge planned' : 'pill event-badge'}>
              <span className="sr-only">{`${record.badge}: `}</span>
              {when}
            </span>
            {record.due && record.due.tone === 'overdue' && <p className="due-overdue visit-overdue">{record.due.text}</p>}

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
              {record.notes && (
                <div>
                  <dt>{planned ? view.notesShort : view.notes}</dt>
                  <dd>{record.notes}</dd>
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

            {(record.editHref || record.heldHref) && (
              <div className="care-actions visit-actions">
                {record.editHref && <Link href={record.editHref} className="btn primary">{view.reschedule}</Link>}
                {record.heldHref && <Link href={record.heldHref} className="link">{view.wasHeld}</Link>}
              </div>
            )}
          </section>

          {calendarHref && (
            <section className="card" aria-labelledby="visit-calendar-title">
              <h2 id="visit-calendar-title">{view.calendarTitle}</h2>
              <p className="muted">{view.calendarBody}</p>
              <a href={calendarHref} target="_blank" rel="noopener noreferrer" className="btn secondary" aria-label={view.calendarAddLabel}>
                <Icon name="calendarAdd" />
                {view.calendarAdd}
              </a>
            </section>
          )}

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

        <aside>
          <section className="card soft visit-pet" aria-labelledby="visit-pet-title">
            <h2 id="visit-pet-title">{view.aboutPet}</h2>
            <PetAvatar size={84} species={pet.species} photoUrl={pet.avatar_url} />
            <h3>{pet.name}</h3>
            <p>{petFacts.meta}</p>
          </section>

          <section className="card event-actions" aria-labelledby="visit-manage-title">
            <h2 id="visit-manage-title">{view.manage}</h2>
            <p className="small muted">{record.actionsBody}</p>
            {record.editHref && (
              <p>
                <Link href={record.editHref} className="link">{view.editRecord}</Link>
              </p>
            )}
            {record.removable && (
              <button
                ref={removeRef}
                type="button"
                className="link danger"
                onClick={() => {
                  setRemoveError(undefined)
                  setAsking(true)
                }}
              >
                {planned ? view.cancelPlan : view.delete}
              </button>
            )}
          </section>
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
