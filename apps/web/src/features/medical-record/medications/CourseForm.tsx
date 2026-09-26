'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MEDICATION_LIMITS, type Medication } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import { useSaveKey } from '@/features/forms/save-key'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { recordCache } from '../record-load'
import { medicalRecordHref } from '../stage'
import { eventSaveFailure, type EventSaveFailure } from '../events/event-form'
import {
  blankCourse,
  coursesChanged,
  draftFromCourse,
  endsByToday,
  readCourseChange,
  readNewCourses,
  type CourseDraft,
  type CourseProblems,
  type CoursesProblems,
} from './course-form'
import { courseErrorTexts } from './course-form-text'

type Banner = Exclude<EventSaveFailure, 'deleting'>

/**
 * New medicines, or a current course being corrected — web v1
 * «medication-new», «course-edit».
 *
 * A new save starts with one empty course; «Ещё препарат» adds another, up
 * to ten, and all of them are stored in one request — the server keeps all
 * or none (`create_pet_medications`). «Постоянно» hides and switches off the
 * end. One Idempotency-Key per form (`useSaveKey`): pressing again, or
 * retrying after «нет связи» or a lost answer, never stores the courses
 * twice. A failure keeps every field and says why beside the button, which
 * works again. A course is never scheduled or reminded of here: the web
 * plans no notifications.
 */
export default function CourseForm({
  petId,
  petName,
  course,
  today,
}: {
  petId: string
  petName: string
  /** The current course being corrected; null for new ones. Never a finished course. */
  course: Medication | null
  today: string
}) {
  const dict = useTranslations()
  const router = useRouter()
  const words = dict.medicalRecord
  const form = words.courseForm
  const id = useId()
  const saveKey = useSaveKey()
  const nextKey = useRef(1)

  const [initial] = useState<CourseDraft[]>(() => (course ? [draftFromCourse(course)] : [blankCourse('new-0', today)]))
  const [drafts, setDrafts] = useState<CourseDraft[]>(initial)
  const [problems, setProblems] = useState<CoursesProblems>({})
  const [banner, setBanner] = useState<Banner | null>(null)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const addRef = useRef<HTMLButtonElement>(null)

  const sectionHref = medicalRecordHref.section(petId, 'medications')
  const backHref = course ? medicalRecordHref.recordView(petId, course.id) : sectionHref
  const dirty = coursesChanged(initial, drafts)
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving)
  const errors = courseErrorTexts(dict, problems)
  const full = drafts.length >= MEDICATION_LIMITS.items

  const fieldId = (key: string, field: string) => `${id}-${key}-${field}`

  function change(key: string, patch: Partial<CourseDraft>, cleared: (keyof CourseProblems)[]) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)))
    setProblems((current) => {
      const own = current.course?.[key]
      if (!own || !cleared.some((field) => own[field])) return current
      const rest = { ...own }
      for (const field of cleared) delete rest[field]
      return { ...current, course: { ...current.course, [key]: rest } }
    })
  }

  function addCourse() {
    const key = `new-${nextKey.current++}`
    setDrafts((current) => [...current, blankCourse(key, today)])
    setProblems((current) => ({ ...current, items: undefined }))
    window.setTimeout(() => document.getElementById(fieldId(key, 'name'))?.focus(), 0)
  }

  function removeCourse(key: string) {
    const index = drafts.findIndex((draft) => draft.key === key)
    const rest = drafts.filter((draft) => draft.key !== key)
    setDrafts(rest)
    // Focus does not fall to the page: the next course's name, or «Ещё препарат».
    const next = rest[index] ?? null
    window.setTimeout(() => {
      if (next) document.getElementById(fieldId(next.key, 'name'))?.focus()
      else addRef.current?.focus()
    }, 0)
  }

  /** Where the first problem is, so focus lands on it. */
  function firstProblemId(found: CoursesProblems): string | null {
    for (const draft of drafts) {
      const own = found.course?.[draft.key]
      if (!own) continue
      if (own.name) return fieldId(draft.key, 'name')
      if (own.dosage) return fieldId(draft.key, 'dosage')
      if (own.start) return fieldId(draft.key, 'start')
      if (own.end) return fieldId(draft.key, 'end')
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return

    const read = course ? readCourseChange(course, drafts[0]) : readNewCourses(drafts)
    if (!read.ok && read.rejected) {
      setProblems({})
      setBanner('rejected')
      console.warn('[medical-record] the course form built a request the contract refuses')
      return
    }
    if (!read.ok) {
      setProblems(read.problems)
      setBanner(null)
      const target = firstProblemId(read.problems)
      if (target) document.getElementById(target)?.focus()
      return
    }
    // Nothing changed: nothing to save, nothing to confirm.
    if (read.value === null) {
      leave(backHref)
      return
    }

    inFlight.current = true
    setSaving(true)
    setProblems({})
    setBanner(null)
    try {
      const api = browserApi()
      if (course && !('items' in read.value)) {
        await api.changeMedication(petId, course.id, read.value)
        recordCache.forget(petId)
        leave(`${backHref}?saved=changed`)
      } else if ('items' in read.value) {
        await api.addMedications(petId, read.value, saveKey.current())
        // The next save of this form would be new courses.
        saveKey.renew()
        recordCache.forget(petId)
        leave(`${sectionHref}?saved=added`)
      }
    } catch (error) {
      inFlight.current = false
      setSaving(false)
      const failure = eventSaveFailure(error)
      if (failure !== 'offline') console.warn('[medical-record] course save failed', error)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      // Beside the button (role=alert); focus stays on «Сохранить» for the retry.
      setBanner(failure)
    }
  }

  return (
    <div className="health-page event-form-page course-form-page">
      <div className="pagehead">
        <div>
          <h1>{course ? form.editTitle : form.addTitle}</h1>
          <p>{petName}</p>
        </div>
        <Link href={backHref} className="link">
          <Icon name="back" />
          {course ? form.toCourse : form.toSection}
        </Link>
      </div>

      <form className="card record-form event-form course-form" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        {drafts.map((draft, index) => {
          const own = errors.course[draft.key] ?? {}
          const title = draft.name.trim() || `${form.itemTitle}${drafts.length > 1 ? ` ${index + 1}` : ''}`
          const startOptional = course !== null && course.started_on === null
          const endsNow = endsByToday(draft, today)
          return (
            <section key={draft.key} className="event-item course-item" aria-label={title}>
              <div className="event-item-head">
                <h3 className="event-item-title">{form.itemTitle}</h3>
                {!course && drafts.length > 1 && (
                  <button
                    type="button"
                    className="icon-button event-item-remove"
                    aria-label={form.remove.replace('{name}', title)}
                    disabled={saving}
                    onClick={() => removeCourse(draft.key)}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor={fieldId(draft.key, 'name')}>{form.name}</label>
                <input
                  id={fieldId(draft.key, 'name')}
                  className="input"
                  type="text"
                  autoComplete="off"
                  maxLength={MEDICATION_LIMITS.name}
                  value={draft.name}
                  readOnly={saving}
                  aria-required="true"
                  aria-invalid={own.name ? true : undefined}
                  aria-describedby={own.name ? fieldId(draft.key, 'name-error') : undefined}
                  onChange={(e) => change(draft.key, { name: e.target.value }, ['name'])}
                />
                {own.name && <span id={fieldId(draft.key, 'name-error')} className="field-error" role="alert">{own.name}</span>}
              </div>

              <div className="field">
                <label className="field-label" htmlFor={fieldId(draft.key, 'dosage')}>
                  {form.dosage}
                  <span className="optional">{form.optional}</span>
                </label>
                <input
                  id={fieldId(draft.key, 'dosage')}
                  className="input"
                  type="text"
                  autoComplete="off"
                  maxLength={MEDICATION_LIMITS.dosage}
                  placeholder={form.dosagePlaceholder}
                  value={draft.dosage}
                  readOnly={saving}
                  aria-invalid={own.dosage ? true : undefined}
                  aria-describedby={own.dosage ? fieldId(draft.key, 'dosage-error') : undefined}
                  onChange={(e) => change(draft.key, { dosage: e.target.value }, ['dosage'])}
                />
                {own.dosage && <span id={fieldId(draft.key, 'dosage-error')} className="field-error" role="alert">{own.dosage}</span>}
              </div>

              <div className="field">
                <label className="field-label" htmlFor={fieldId(draft.key, 'start')}>
                  {form.start}
                  {startOptional && <span className="optional">{form.optional}</span>}
                </label>
                <input
                  id={fieldId(draft.key, 'start')}
                  className="input"
                  type="date"
                  value={draft.start}
                  readOnly={saving}
                  aria-required={startOptional ? undefined : 'true'}
                  aria-invalid={own.start ? true : undefined}
                  aria-describedby={
                    [own.start ? fieldId(draft.key, 'start-error') : null, startOptional ? fieldId(draft.key, 'start-hint') : null]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  onChange={(e) => change(draft.key, { start: e.target.value }, ['start', 'end'])}
                />
                {own.start && <span id={fieldId(draft.key, 'start-error')} className="field-error" role="alert">{own.start}</span>}
                {startOptional && <span id={fieldId(draft.key, 'start-hint')} className="field-hint">{form.startUnknownHint}</span>}
              </div>

              <label className="check-row course-ongoing">
                <input
                  type="checkbox"
                  checked={draft.ongoing}
                  disabled={saving}
                  onChange={(e) => change(draft.key, { ongoing: e.target.checked }, ['end'])}
                />
                {form.ongoing}
              </label>

              {/* «Постоянно»: no end — the field is gone and nothing is sent for it. */}
              {!draft.ongoing && (
                <div className="field">
                  <label className="field-label" htmlFor={fieldId(draft.key, 'end')}>
                    {form.end}
                    <span className="optional">{form.optional}</span>
                  </label>
                  <input
                    id={fieldId(draft.key, 'end')}
                    className="input"
                    type="date"
                    value={draft.end}
                    min={draft.start || undefined}
                    readOnly={saving}
                    aria-invalid={own.end ? true : undefined}
                    aria-describedby={
                      [own.end ? fieldId(draft.key, 'end-error') : null, endsNow ? fieldId(draft.key, 'end-hint') : null]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    onChange={(e) => change(draft.key, { end: e.target.value }, ['end'])}
                  />
                  {own.end && <span id={fieldId(draft.key, 'end-error')} className="field-error" role="alert">{own.end}</span>}
                  {endsNow && <span id={fieldId(draft.key, 'end-hint')} className="field-hint course-ends-now">{form.endsNow}</span>}
                </div>
              )}
            </section>
          )
        })}

        {!course &&
          (full ? (
            <p className="field-hint">{form.itemsFull.replace('{max}', String(MEDICATION_LIMITS.items))}</p>
          ) : (
            <button ref={addRef} type="button" className="link event-add-item" disabled={saving} onClick={addCourse}>
              <Icon name="plus" />
              {form.addAnother}
            </button>
          ))}
        {errors.items && <span className="field-error" role="alert">{errors.items}</span>}

        <p className="field-hint course-note">{form.note}</p>

        {banner && (
          <div className="banner error record-form-error event-form-banner" role="alert">
            <p>{form.errors[banner]}</p>
            {banner === 'alreadySaved' && <Link href={sectionHref} className="link">{words.coursesPage.title}</Link>}
            {banner === 'done' && course && (
              <Link href={medicalRecordHref.recordView(petId, course.id)} className="link">{words.courseRecord.openCourse}</Link>
            )}
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
            {saving ? form.saving : course ? form.saveChanges : form.save}
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
