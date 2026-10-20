'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { endCoursePatch } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import { recordCache } from '../record-load'
import SavedNotice from '../SavedNotice'
import { useMedicalRecord } from '../use-medical-record'
import { eventSaveFailure } from '../events/event-form'
import { courseRecord, type CourseSaved } from './course-view'
import { CourseGone } from './CourseFormScreen'
import DoseTimesField from './DoseTimesField'
import TodayDoses from '../TodayDoses'
import { useTodayDoses } from '../doses/use-today-doses'
import { medicalRecordHref } from '../routes'

/**
 * One medication course (web v1 «course», «course-finished»). A current
 * course has «Изменить» and «Завершить курс», which asks first, naming the
 * course, and ends it on the owner's today: it stays in the history and
 * leaves «Принимает сейчас». A finished course is only read — no
 * «Изменить», and its edit address shows this page (owner rule of 26
 * September 2026). Deleting a wrong course asks first as well. «Не
 * завершать» / «Не удалять» and Escape return focus to the button.
 */
export default function CourseScreen({ petId, courseId, saved }: { petId: string; courseId: string; saved: CourseSaved | null }) {
  const dict = useTranslations()
  const router = useRouter()
  const words = dict.medicalRecord
  const view = words.courseRecord
  const { state, reload, refresh, today } = useMedicalRecord(petId)
  const [asking, setAsking] = useState<'end' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | undefined>()
  /** «Курс завершён» once the end is stored and the course read again. */
  const [ended, setEnded] = useState(false)
  const endRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const inFlight = useRef(false)
  const courses = state.status === 'ready' ? state.data.overview.medications.filter((entry) => entry.id === courseId) : []
  const doses = useTodayDoses(petId, courses, today)

  // The end is stored: read the record again, so the page shows the course as finished.
  useEffect(() => {
    if (!ended) return
    recordCache.forget(petId)
    reload()
    // Once per end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended])

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<CourseSkeleton label={words.states.loading} />} />
  }

  const course = state.data.overview.medications.find((entry) => entry.id === courseId)
  if (!course) return <CourseGone petId={petId} />
  const record = courseRecord(dict, petId, course, today, state.data.overview.writable)

  function failureText(error: unknown, fallback: string): string | null {
    const failure = eventSaveFailure(error)
    if (failure === 'deleting') {
      router.replace('/account-deletion')
      return null
    }
    if (failure !== 'offline') console.warn('[medical-record] course action failed', error)
    if (failure === 'offline' || failure === 'signedOut' || failure === 'done') return words.courseForm.errors[failure]
    return fallback
  }

  async function end() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setDialogError(undefined)
    try {
      // The owner's day goes along: the server counts «finished» by it, as this page does.
      await browserApi().changeMedication(petId, courseId, endCoursePatch(today), today)
      inFlight.current = false
      setBusy(false)
      setAsking(null)
      setEnded(true)
      // The questionnaire and the pet list read the server anew.
      router.refresh()
    } catch (error) {
      inFlight.current = false
      setBusy(false)
      const failure = eventSaveFailure(error)
      // Gone meanwhile, or finished meanwhile (elsewhere, or an earlier attempt
      // whose answer was lost): the page shows which once the record is read again.
      if (failure === 'gone' || failure === 'done') {
        setAsking(null)
        recordCache.forget(petId)
        reload()
        return
      }
      const text = failureText(error, view.endFailed)
      if (text) setDialogError(text)
    }
  }

  async function remove() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setDialogError(undefined)
    try {
      await browserApi().deleteMedication(petId, courseId, today)
      gone()
    } catch (error) {
      // Already gone: deleted elsewhere, or an earlier attempt whose answer was lost.
      if (eventSaveFailure(error) === 'gone') {
        gone()
        return
      }
      inFlight.current = false
      setBusy(false)
      const text = failureText(error, view.deleteFailed)
      if (text) setDialogError(text)
    }
  }

  function gone() {
    recordCache.forget(petId)
    router.push(`${record.sectionHref}?saved=deleted`)
    router.refresh()
  }

  const dosageLabel = record.current ? view.dosage : view.dosageFinished
  const timesEditable = record.current && record.removable

  return (
    <div className="health-page event-record-page course-page">
      <Link href={record.sectionHref} className="link health-back">
        <Icon name="back" />
        {view.back}
      </Link>

      <div className="pagehead">
        <div>
          <h1>{record.title}</h1>
          <p>{`${state.data.overview.pet.name} · ${view.kind}`}</p>
        </div>
        <Link href={medicalRecordHref.record(petId)} className="link">
          <Icon name="back" />
          {view.toRecord}
        </Link>
      </div>

      {/* Keyed: the end's confirmation is a new notice that takes focus, even over a `?saved=` one. */}
      {ended ? (
        <SavedNotice key="ended" text={words.coursesPage.saved.ended} />
      ) : (
        saved && <SavedNotice key={`saved-${saved}`} text={words.coursesPage.saved[saved]} />
      )}
      <StaleNotice state={state} reload={reload} />

      <div className="care-columns course-columns">
        <div>
          <section className="card course-record" aria-labelledby="course-title">
            <div className="course-record-head">
              <h2 id="course-title">{view.courseTitle}</h2>
              <span className={record.current ? 'pill event-badge planned' : 'pill event-badge'}>{record.badge}</span>
            </div>
            <dl className="course-facts">
              <div>
                <dt>{dosageLabel}</dt>
                <dd>{record.dosage ?? view.noDosage}</dd>
              </div>
              <div>
                <dt>{view.period}</dt>
                <dd id="course-period">{record.period}</dd>
              </div>
            </dl>
            {record.editHref && (
              <>
                <div className="divider" />
                <Link href={record.editHref} className="link">{view.edit}</Link>
              </>
            )}
          </section>

          <DoseTimesField
            key={course.id}
            petId={petId}
            course={course}
            editable={timesEditable}
            onSaved={() => {
              recordCache.forget(petId)
              refresh()
            }}
          />

          <div className="care-actions course-actions" aria-label={view.actionsTitle} role="group">
            {record.endable && (
              <button
                ref={endRef}
                type="button"
                className="btn secondary"
                onClick={() => {
                  setDialogError(undefined)
                  setAsking('end')
                }}
              >
                {view.end}
              </button>
            )}
            {record.removable && (
              <button
                ref={deleteRef}
                type="button"
                className="link danger"
                onClick={() => {
                  setDialogError(undefined)
                  setAsking('delete')
                }}
              >
                {view.delete}
              </button>
            )}
          </div>
          <p className="small muted">{record.actionsBody}</p>
        </div>

        <aside>
          {doses.rows.length > 0 && (
            <TodayDoses title={words.doses.courseTitle} doses={doses} today={today} headingId="course-today-title" />
          )}
          <section className="card soft" aria-labelledby="course-one-history">
            <h2 id="course-one-history">{words.oneHistory.title}</h2>
            <p>{words.oneHistory.body}</p>
          </section>
        </aside>
      </div>

      {asking === 'end' && (
        <ConfirmDialog
          title={record.endTitle}
          body={record.endBody}
          cancelLabel={view.endKeep}
          confirmLabel={view.endConfirm}
          busyLabel={view.ending}
          busy={busy}
          error={dialogError}
          onCancel={() => setAsking(null)}
          onConfirm={end}
          returnFocusRef={endRef}
        />
      )}
      {asking === 'delete' && (
        <ConfirmDialog
          title={record.deleteTitle}
          body={record.deleteBody}
          cancelLabel={view.keep}
          confirmLabel={view.deleteConfirm}
          busyLabel={view.deleting}
          busy={busy}
          error={dialogError}
          tone="danger"
          onCancel={() => setAsking(null)}
          onConfirm={remove}
          returnFocusRef={deleteRef}
        />
      )}
    </div>
  )
}

function CourseSkeleton({ label }: { label: string }) {
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
