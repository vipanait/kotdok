'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { localToday } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import { recordCache } from '../record-load'
import SavedNotice from '../SavedNotice'
import { useMedicalRecord } from '../use-medical-record'
import { eventSaveFailure, type EventFormKind } from './event-form'
import { EventGone } from './EventFormScreen'
import { eventRecord, type EventSaved } from './event-view'

/**
 * One saved vaccination or treatment (web v1 «record», «planned»). A done
 * record is only read: no «Изменить», and its edit address shows this page
 * instead (owner rule of 26 September 2026). A plan is changed through
 * «Изменить», which keeps its id, day and items. Deleting a wrong record or
 * cancelling a plan asks first, naming the record; «Не удалять» leaves it
 * and returns focus to the button. «Сделано» on a plan (MW-04) marks one
 * of its items; a plan of several asks which. An older server that does not
 * store the kind (`writable`) gets no action at all.
 */
export default function EventRecordScreen({
  petId,
  eventId,
  kind,
  saved,
}: {
  petId: string
  eventId: string
  /** What the page found the record to be: where «В раздел» leads if it is gone by the time it loads. */
  kind: EventFormKind
  saved: EventSaved | null
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const words = dict.medicalRecord
  const view = words.eventRecord
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | undefined>()
  const removeRef = useRef<HTMLButtonElement>(null)
  const inFlight = useRef(false)

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<RecordSkeleton label={words.states.loading} />} />
  }

  const { events } = state.data.overview
  const event = events.find((entry) => entry.id === eventId)
  if (!event || event.kind === 'visit') return <EventGone petId={petId} kind={kind} />
  const record = eventRecord(dict, locale, petId, event, events, today, state.data.overview.writable)
  const planned = record.status === 'planned'

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
      await browserApi().deleteHealthEvent(petId, eventId)
      gone()
    } catch (error) {
      const failure = eventSaveFailure(error)
      // Already gone: deleted elsewhere, or an earlier attempt whose answer was lost.
      if (failure === 'gone') {
        gone()
        return
      }
      inFlight.current = false
      setRemoving(false)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      if (failure !== 'offline') console.warn('[medical-record] record delete failed', error)
      setRemoveError(failure === 'offline' || failure === 'signedOut' ? words.eventForm.errors[failure] : view.deleteFailed)
    }
  }

  return (
    <div className="health-page event-record-page">
      <Link href={record.sectionHref} className="link health-back">
        <Icon name="back" />
        {view.back}
      </Link>

      <div className="pagehead">
        <div>
          <h1>{record.title}</h1>
          <p>{state.data.overview.pet.name}</p>
        </div>
        {(record.completeHref || record.editHref) && (
          <div className="pagehead-actions">
            {record.completeHref && (
              <Link href={record.completeHref} className="btn primary">{view.markDone}</Link>
            )}
            {record.editHref && (
              <Link href={record.editHref} className="btn secondary">{view.edit}</Link>
            )}
          </div>
        )}
      </div>

      {saved && <SavedNotice text={words.eventsPage.saved[saved]} />}
      <StaleNotice state={state} reload={reload} />

      <div className="section-layout">
        <div className="section-main">
          <section className="card event-record-head" aria-labelledby="event-record-day">
            <span className={planned ? 'pill event-badge planned' : 'pill event-badge'}>{record.badge}</span>
            <h2 id="event-record-day">{record.day}</h2>
            {record.due && <p className={`event-due ${record.due.tone}`}>{record.due.text}</p>}
            {record.clinic && <p>{`${view.clinic}: ${record.clinic}`}</p>}
          </section>

          <section className="card event-record-items" aria-label={view.itemsLabel}>
            <ul>
              {record.items.map((item) => (
                <li key={item.key}>
                  <strong>{item.name}</strong>
                  {item.targets && <span>{item.targets}</span>}
                  {item.next && <span>{item.next}</span>}
                </li>
              ))}
            </ul>
            {record.notes && (
              <div className="event-record-notes">
                <h3>{view.notes}</h3>
                <p>{record.notes}</p>
              </div>
            )}
          </section>
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
