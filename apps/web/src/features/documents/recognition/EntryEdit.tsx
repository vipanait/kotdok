'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import type { PetSpecies } from '@lapka/contracts'
import { readNewCourses, type DraftEntry } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import CatalogCombobox from '@/features/medical-record/events/CatalogCombobox'
import EventItemCard from '@/features/medical-record/events/EventItemCard'
import {
  EVENT_FORM_KINDS,
  changeDate,
  manualItem,
  noProductItem,
  productItem,
  readNewEvent,
  type EventDraft,
  type EventProblems,
  type ItemDraft,
} from '@/features/medical-record/events/event-form'
import { eventErrorTexts } from '@/features/medical-record/events/event-form-text'
import CourseFields from '@/features/medical-record/medications/CourseFields'
import type { CourseDraft, CoursesProblems } from '@/features/medical-record/medications/course-form'
import { courseErrorTexts } from '@/features/medical-record/medications/course-form-text'
import { entryFromCourseDraft, entryFromEventDraft, reviewIds, type EditState } from './recognition-view'

/**
 * One recognised entry opened from the review with its values (design run
 * «edit»): a vaccination or treatment in the event form's own fields — the
 * day, the catalogue choice, the targets as the existing chips, the next
 * date — and a course in the medicine form's. «Готово» checks it by those
 * forms' rules and hands the entry back; nothing is saved to the medical
 * record until the review is confirmed. «← К проверке» and «Отмена» ask
 * first when something was changed.
 *
 * The form's state lives with the review (`state`/`onStateChange`), so a
 * trip to a page of the original keeps what was typed.
 */
export default function EntryEdit({
  entry,
  state,
  initial,
  species,
  today,
  originalHref,
  onOpenOriginal,
  onStateChange,
  onDone,
  onCancel,
}: {
  /** The entry as the review has it now. */
  entry: DraftEntry
  state: EditState
  /** The form as it opened: «Отмена» asks only when it differs. */
  initial: EditState
  species: PetSpecies
  today: string
  originalHref: string
  /** Before going to the original: the review keeps everything for the way back. */
  onOpenOriginal: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void
  onStateChange: (state: EditState) => void
  onDone: (entry: DraftEntry) => void
  onCancel: () => void
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.documents.recognition.edit
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const catalogRef = useRef<HTMLInputElement>(null)
  const [eventProblems, setEventProblems] = useState<EventProblems>({})
  const [courseProblems, setCourseProblems] = useState<CoursesProblems>({})
  const [asking, setAsking] = useState(false)
  const nextKey = useRef(0)

  const dirty = JSON.stringify(state.form) !== JSON.stringify(initial.form)

  // The heading is where a screen reader starts on the edit.
  useEffect(() => headingRef.current?.focus(), [])

  function leave() {
    if (dirty) setAsking(true)
    else onCancel()
  }

  function setEvent(draft: EventDraft) {
    onStateChange({ ...state, form: { kind: 'event', draft } })
  }

  function setCourse(draft: CourseDraft) {
    onStateChange({ ...state, form: { kind: 'course', draft } })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (state.form.kind === 'event' && entry.type !== 'medication') {
      const read = readNewEvent(state.form.draft, today)
      if (!read.ok) {
        setEventProblems(read.problems)
        const item = state.form.draft.items[0]
        const own = item ? read.problems.item?.[item.key] : undefined
        const target = read.problems.date
          ? `${id}-date`
          : read.problems.items
            ? (catalogRef.current?.id ?? null)
            : own?.name
              ? `${id}-${item?.key}-name`
              : own?.targets
                ? `${id}-${item?.key}-targets`
                : own?.next
                  ? `${id}-${item?.key}-next`
                  : null
        if (target) document.getElementById(target)?.focus()
        return
      }
      onDone(entryFromEventDraft(entry, state.form.draft))
      return
    }
    if (state.form.kind === 'course' && entry.type === 'medication') {
      const read = readNewCourses([state.form.draft])
      if (!read.ok) {
        setCourseProblems(read.problems)
        const own = read.problems.course?.[state.form.draft.key]
        const field = own?.name ? 'name' : own?.dosage ? 'dosage' : own?.start ? 'start' : own?.end ? 'end' : null
        if (field) document.getElementById(`${id}-${state.form.draft.key}-${field}`)?.focus()
        return
      }
      onDone(entryFromCourseDraft(entry, state.form.draft))
    }
  }

  const unreadName = entry.unsure.includes('name') && entry.name ? entry.name : null

  return (
    <div className="recognition-edit">
      <button type="button" className="link health-back" onClick={leave}>
        <Icon name="back" />
        {words.back}
      </button>
      <div className="pagehead">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="document-heading">{words.title[entry.type]}</h1>
          <p>{words.fromPage.replace('{n}', String(entry.page))}</p>
        </div>
      </div>

      <div className="section-layout document-layout">
        <div className="section-main document-main">
          {entry.unsure.length > 0 && (
            <div className="banner document-alert" role="note">
              <strong>{words.unsureTitle}</strong>
              <p>{unreadName ? `${words.asWritten.replace('{text}', unreadName)} ${words.unsureBody}` : words.unsureBody}</p>
            </div>
          )}
          <Link
            id={reviewIds.editPage(entry.key)}
            href={originalHref}
            className="link recognition-page-link"
            onClick={(e) => onOpenOriginal(e, originalHref)}
          >
            {words.openPage.replace('{n}', String(entry.page))}
          </Link>

          <form className="record-form event-form recognition-edit-form" onSubmit={submit} noValidate>
            {state.form.kind === 'event' && entry.type !== 'medication' ? (
              <EventFields
                id={id}
                draft={state.form.draft}
                kind={entry.type}
                species={species}
                today={today}
                locale={locale}
                problems={eventProblems}
                catalogRef={catalogRef}
                nextKey={() => `${entry.key}-${nextKey.current++}`}
                onChange={(draft, cleared) => {
                  setEvent(draft)
                  if (cleared) setEventProblems({})
                }}
              />
            ) : state.form.kind === 'course' ? (
              <CourseFields
                idBase={id}
                draft={state.form.draft}
                title={state.form.draft.name.trim() || dict.medicalRecord.courseForm.itemTitle}
                errors={courseErrorTexts(dict, courseProblems).course[state.form.draft.key] ?? {}}
                startOptional={false}
                today={today}
                saving={false}
                onChange={(patch) => {
                  if (state.form.kind === 'course') setCourse({ ...state.form.draft, ...patch })
                  setCourseProblems({})
                }}
              />
            ) : null}
            {entry.type === 'medication' && <p className="field-hint">{dict.documents.recognition.review.doctorNote}</p>}

            <p className="field-hint">{words.hint}</p>
            <div className="recognition-actions recognition-edit-actions">
              <button type="submit" className="btn primary">
                {words.done}
              </button>
              <button ref={cancelRef} type="button" className="btn secondary" onClick={leave}>
                {words.cancel}
              </button>
            </div>
          </form>
        </div>
        <aside className="section-aside document-aside">
          <h2>{words.asideTitle}</h2>
          <p>{words.asideBody}</p>
        </aside>
      </div>

      {asking && (
        <ConfirmDialog
          title={words.leaveTitle}
          body={words.leaveBody}
          cancelLabel={words.leaveStay}
          confirmLabel={words.leaveConfirm}
          tone="danger"
          className="document-confirm"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            onCancel()
          }}
          returnFocusRef={cancelRef}
        />
      )}
    </div>
  )
}

/**
 * The day, the catalogue (to pick or replace the product, type a name, or
 * «Без препарата»), and the one item in the event form's own card.
 */
function EventFields({
  id,
  draft,
  kind,
  species,
  today,
  locale,
  problems,
  catalogRef,
  nextKey,
  onChange,
}: {
  id: string
  draft: EventDraft
  kind: 'vaccination' | 'parasite'
  species: PetSpecies
  today: string
  locale: ReturnType<typeof useLocale>
  problems: EventProblems
  catalogRef: React.RefObject<HTMLInputElement | null>
  nextKey: () => string
  onChange: (draft: EventDraft, cleared: boolean) => void
}) {
  const dict = useTranslations()
  const form = dict.medicalRecord.eventForm
  const errors = eventErrorTexts(dict, kind, problems)
  const item = draft.items[0]

  function replace(next: ItemDraft) {
    onChange({ ...draft, items: [next] }, true)
  }

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-date`}>{form.whenDone}</label>
        <input
          id={`${id}-date`}
          className="input"
          type="date"
          value={draft.date}
          max={today}
          aria-required="true"
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? `${id}-date-error` : undefined}
          onChange={(e) => onChange(changeDate(draft, e.target.value, today), true)}
        />
        {errors.date && <span id={`${id}-date-error`} className="field-error" role="alert">{errors.date}</span>}
      </div>

      <fieldset className="event-items">
        <legend className="event-items-title">{form[kind].items}</legend>
        <CatalogCombobox
          species={species}
          productKind={EVENT_FORM_KINDS[kind].product}
          label={dict.medicalRecord.catalog.label}
          inputRef={catalogRef}
          onPick={(product) => replace(productItem(item?.key ?? nextKey(), product, draft, today, locale))}
          onManual={(typed) => replace(manualItem(item?.key ?? nextKey(), typed))}
          onNoProduct={() => replace(noProductItem(item?.key ?? nextKey()))}
        />
        {errors.items && <span className="field-error" role="alert">{errors.items}</span>}
        {item && (
          <EventItemCard
            idBase={id}
            kind={kind}
            species={species}
            item={item}
            draft={draft}
            today={today}
            errors={errors.item[item.key] ?? {}}
            saving={false}
            onChange={(change) => onChange({ ...draft, items: draft.items.map((current) => (current.key === item.key ? change(current) : current)) }, true)}
          />
        )}
      </fieldset>
    </>
  )
}
