'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HEALTH_EVENT_LIMITS, type CompleteItemInput, type HealthEvent, type HealthItem } from '@lapka/contracts'
import { completionMismatch, nextDayMin, type CompletionMismatch } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import { useSaveKey } from '@/features/forms/save-key'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { RecordProblem } from '../MedicalRecordScreen'
import { recordCache } from '../record-load'
import { medicalRecordHref, withSaved, type CompleteFrom } from '../stage'
import type { Fresh } from '../held-record'
import { DriftNotice, useHeldRecord } from '../use-held-record'
import { useMedicalRecord } from '../use-medical-record'
import { eventItemName } from '../view-model'
import {
  changeDoneDay,
  completeDraft,
  completionChanged,
  completionTarget,
  othersInPlan,
  readCompletion,
  type CompleteDraft,
  type CompleteProblems,
} from './complete-form'
import { completeErrorTexts, completeFailureText, completionNote, confirmTexts, earlierText, planDayText } from './complete-form-text'
import { nextHintText } from './event-form-text'
import { eventSaveFailure, EVENT_FORM_KINDS, type EventFormKind, type EventSaveFailure } from './event-form'
import { EventGone } from './EventFormScreen'
import { targetsText } from './event-view'

/**
 * Above the buttons after a save that did not go as sent: a failure, or an
 * item that was already done with other data (the server answered 200 with
 * that earlier record).
 */
type Banner =
  | { kind: 'failure'; failure: Exclude<EventSaveFailure, 'deleting'> }
  | { kind: 'earlier'; mismatch: CompletionMismatch; recordId: string; day: string }

/** Where the form's «Отмена» and back link lead. */
function backHref(petId: string, eventId: string, kind: EventFormKind, from: CompleteFrom): string {
  if (from === 'due') return medicalRecordHref.due(petId)
  if (from === 'medical') return medicalRecordHref.record(petId)
  if (from === 'section') return medicalRecordHref.section(petId, EVENT_FORM_KINDS[kind].section)
  return medicalRecordHref.recordView(petId, eventId)
}

/**
 * After «Сделано»: back where it was pressed — the list of due dates, the
 * section, the record page, or the plan's own page while other items stay
 * in it — with the confirmation and the done record one click away in it
 * (implementation-handoff, «Поведение», MW-09). A plan of one item became
 * the done record itself: its page is where it was pressed.
 */
function savedHref(petId: string, plan: HealthEvent, savedId: string, kind: EventFormKind, from: CompleteFrom, others: number): string {
  if (from === 'due') return withSaved(medicalRecordHref.due(petId), 'completed', savedId)
  if (from === 'section') return withSaved(medicalRecordHref.section(petId, EVENT_FORM_KINDS[kind].section), 'completed', savedId)
  if (from === 'medical') return withSaved(medicalRecordHref.record(petId), 'completed', savedId)
  if (others > 0 && savedId !== plan.id) return withSaved(medicalRecordHref.recordView(petId, plan.id), 'completed', savedId)
  return withSaved(medicalRecordHref.recordView(petId, savedId), 'completed')
}

/** What the latest load says about the item the form marks. */
type Marked = { plan: HealthEvent; item: HealthItem }

function freshMarked(events: HealthEvent[], eventId: string, itemId: string | null): Fresh<Marked> {
  const plan = events.find((event) => event.id === eventId)
  if (!plan || plan.kind === 'visit') return { kind: 'gone' }
  if (plan.status === 'done') return { kind: 'closed' }
  const target = completionTarget(plan, itemId)
  return target.kind === 'item' ? { kind: 'open', record: { plan, item: target.item } } : { kind: 'closed' }
}

/**
 * `/pets/[id]/health/[recordId]/complete` — «Сделано» on a plan (web v1
 * «planned-complete», «planned-rabies-complete», «parasite-complete»). It
 * marks one item: the one named by `?item=`, the only one, or — for a plan of
 * several — the one the owner picks first. The rest stay planned.
 */
export default function CompleteScreen({
  petId,
  eventId,
  kind,
  itemId,
  from,
}: {
  petId: string
  eventId: string
  kind: EventFormKind
  itemId: string | null
  from: CompleteFrom
}) {
  const dict = useTranslations()
  const { state, reload, today } = useMedicalRecord(petId)
  // The form keeps what it opened with while the owner types; a refresh underneath only tells (MW-09).
  const held = useHeldRecord(state.status === 'ready' ? freshMarked(state.data.overview.events, eventId, itemId) : null)

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }

  const { overview } = state.data
  if (held.record) {
    const { plan, item } = held.record
    // Keyed by the item and the load it started from: another item — or new data taken on purpose — starts over.
    return (
      <CompleteItemForm
        key={`${item.id}-${held.version}`}
        petId={petId}
        petName={overview.pet.name}
        plan={plan}
        item={item}
        from={from}
        today={today}
        onDirtyChange={held.setDirty}
        notice={
          <DriftNotice
            drift={held.drift}
            onTakeLatest={held.takeLatest}
            sectionHref={medicalRecordHref.section(petId, EVENT_FORM_KINDS[kind].section)}
            recordHref={medicalRecordHref.recordView(petId, plan.id)}
          />
        }
      />
    )
  }

  const plan = overview.events.find((event) => event.id === eventId)
  if (!plan || plan.kind === 'visit') return <EventGone petId={petId} kind={kind} />
  if (plan.status === 'done') {
    return (
      <Notice
        title={dict.medicalRecord.completeForm.doneTitle}
        body={dict.medicalRecord.completeForm.doneBody}
        href={medicalRecordHref.recordView(petId, plan.id)}
        action={dict.medicalRecord.eventRecord.openRecord}
      />
    )
  }

  const target = completionTarget(plan, itemId)
  if (target.kind === 'choose') {
    return <ChooseItem petId={petId} plan={plan} items={target.items} from={from} petName={overview.pet.name} dict={dict} />
  }
  return (
    <Notice
      title={dict.medicalRecord.completeForm.missingTitle}
      body={dict.medicalRecord.completeForm.missingBody}
      href={medicalRecordHref.recordView(petId, plan.id)}
      action={dict.medicalRecord.eventRecord.openRecord}
    />
  )
}

function ChooseItem({
  petId,
  petName,
  plan,
  items,
  from,
  dict,
}: {
  petId: string
  petName: string
  plan: HealthEvent
  items: HealthItem[]
  from: CompleteFrom
  dict: Dictionary
}) {
  const words = dict.medicalRecord.completeForm
  const kind = plan.kind as EventFormKind
  const ref = useFocusOnMount<HTMLHeadingElement>()
  return (
    <div className="health-page complete-page">
      <Link href={backHref(petId, plan.id, kind, from)} className="link health-back">
        <Icon name="back" />
        {words.back[from]}
      </Link>
      <div className="pagehead">
        <div>
          <h1 ref={ref} tabIndex={-1}>{words.chooseTitle[kind]}</h1>
          <p>{petName}</p>
        </div>
      </div>
      <section className="card complete-choose" aria-labelledby="complete-choose-body">
        <p id="complete-choose-body">{words.chooseBody}</p>
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={medicalRecordHref.complete(petId, plan.id, item.id, from)} className="btn primary complete-choice">
                <strong>{eventItemName(dict, kind, item)}</strong>
                {item.name && item.targets.length > 0 && <span>{targetsText(dict.medicalRecord, item.targets)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function CompleteItemForm({
  petId,
  petName,
  plan,
  item,
  from,
  today,
  onDirtyChange,
  notice,
}: {
  petId: string
  petName: string
  plan: HealthEvent
  item: HealthItem
  from: CompleteFrom
  today: string
  /** Whether the owner has typed (or is saving): the page keeps the form as it is while so. */
  onDirtyChange: (dirty: boolean) => void
  /** What became of the record meanwhile, under the heading. */
  notice: React.ReactNode
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const words = dict.medicalRecord.completeForm
  const form = dict.medicalRecord.eventForm
  const kind = plan.kind as EventFormKind
  const id = useId()
  const saveKey = useSaveKey()

  const [initial] = useState<CompleteDraft>(() => completeDraft(plan, item, today))
  const [draft, setDraft] = useState<CompleteDraft>(initial)
  const [problems, setProblems] = useState<CompleteProblems>({})
  const [banner, setBanner] = useState<Banner | null>(null)
  const [saving, setSaving] = useState(false)
  /** The question before the save: the checked body waiting for «Отметить сделанным». */
  const [confirming, setConfirming] = useState<CompleteItemInput | null>(null)
  const inFlight = useRef(false)
  const submitRef = useRef<HTMLButtonElement>(null)

  const back = backHref(petId, plan.id, kind, from)
  const dirty = completionChanged(initial, draft)
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving)
  useEffect(() => onDirtyChange(dirty || saving), [dirty, saving, onDirtyChange])
  const errors = completeErrorTexts(dict, problems)
  const others = othersInPlan(plan, item)
  const name = eventItemName(dict, kind, item)

  function clear(field: keyof CompleteProblems) {
    if (problems[field]) setProblems((current) => ({ ...current, [field]: undefined }))
  }

  /** «Сохранить»: the fields are checked first; only a form that can be sent is asked about. */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return

    const read = readCompletion(draft, today)
    if (!read.ok && read.rejected) {
      setProblems({})
      setBanner({ kind: 'failure', failure: 'rejected' })
      console.warn('[medical-record] the form built a completion the contract refuses')
      return
    }
    if (!read.ok) {
      setProblems(read.problems)
      setBanner(null)
      const first = read.problems.doneOn ? 'done' : read.problems.next ? 'next' : read.problems.clinic ? 'clinic' : 'notes'
      document.getElementById(`${id}-${first}`)?.focus()
      return
    }
    setProblems({})
    setBanner(null)
    // A separate step (implementation-handoff, «Окончательное правило»): the day, a look at the fields, a confirmation.
    setConfirming(read.input)
  }

  async function save(input: CompleteItemInput) {
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    try {
      // One key for this «Сделано» however many times it is sent: a retry after
      // a lost answer finds the record the first try made.
      const api = browserApi()
      const saved = await api.completeHealthItem(petId, item.id, input, saveKey.current())
      recordCache.forget(petId)
      // A 200 is not success by itself: an item already done is answered with
      // the record as first saved. Its next plan is checked when the record
      // can be read; if not, the day alone decides.
      const events = await api.getHealthOverview(petId, today).then((overview) => overview.events, () => null)
      const mismatch = completionMismatch(input, saved, item.id, events)
      if (mismatch) {
        inFlight.current = false
        setSaving(false)
        setBanner({ kind: 'earlier', mismatch, recordId: saved.id, day: saved.date })
        return
      }
      saveKey.renew()
      leave(savedHref(petId, plan, saved.id, kind, from, others))
    } catch (error) {
      inFlight.current = false
      setSaving(false)
      const failure = eventSaveFailure(error)
      if (failure !== 'offline') console.warn('[medical-record] marking done failed', error)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      // Nothing is claimed: the form stays as it was, the banner says why, the button works again.
      setBanner({ kind: 'failure', failure })
    }
  }

  const question = confirming ? confirmTexts(dict, name, draft, today) : null

  return (
    <div className="health-page event-form-page complete-page">
      <Link href={back} className="link health-back">
        <Icon name="back" />
        {words.back[from]}
      </Link>
      <div className="pagehead">
        <div>
          <h1>{words.title}</h1>
          <p>{petName}</p>
        </div>
      </div>

      {notice}

      <form className="card record-form event-form complete-form" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        <div className="complete-head">
          <span className="pill event-badge">{words.badge}</span>
          <p className="field-hint">{planDayText(dict, plan.date)}</p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${id}-done`}>{words.whenDone}</label>
          <input
            id={`${id}-done`}
            className="input"
            type="date"
            value={draft.doneOn}
            max={today}
            readOnly={saving}
            aria-required="true"
            aria-invalid={errors.doneOn ? true : undefined}
            aria-describedby={errors.doneOn ? `${id}-done-error` : undefined}
            onChange={(e) => {
              setDraft(changeDoneDay(draft, item, e.target.value, today))
              clear('doneOn')
            }}
          />
          {errors.doneOn && <span id={`${id}-done-error`} className="field-error" role="alert">{errors.doneOn}</span>}
        </div>

        <section className="event-item complete-item" aria-label={name}>
          <dl className="complete-item-facts">
            <div>
              <dt>{words.itemLabel[kind]}</dt>
              <dd>{item.name ?? dict.medicalRecord.due.noProduct}</dd>
            </div>
            {item.targets.length > 0 && (
              <div>
                <dt>{words.targetsLabel[kind]}</dt>
                <dd>{targetsText(dict.medicalRecord, item.targets)}</dd>
              </div>
            )}
          </dl>

          <div className="field event-item-next">
            <label className="field-label" htmlFor={`${id}-next`}>
              {form.nextLabel}
              <span className="optional">{form.optional}</span>
            </label>
            <div className="event-next-row">
              <input
                id={`${id}-next`}
                className="input"
                type="date"
                value={draft.next}
                min={nextDayMin(draft.doneOn, today)}
                readOnly={saving}
                aria-invalid={errors.next ? true : undefined}
                aria-describedby={[errors.next ? `${id}-next-error` : null, `${id}-next-hint`].filter(Boolean).join(' ')}
                onChange={(e) => {
                  setDraft({ ...draft, next: e.target.value, nextTouched: true })
                  clear('next')
                }}
              />
              {draft.next !== '' && (
                <button
                  type="button"
                  className="link event-next-clear"
                  disabled={saving}
                  onClick={() => {
                    setDraft({ ...draft, next: '', nextTouched: true })
                    clear('next')
                    document.getElementById(`${id}-next`)?.focus()
                  }}
                >
                  {form.clearNext}
                </button>
              )}
            </div>
            {errors.next && <span id={`${id}-next-error`} className="field-error" role="alert">{errors.next}</span>}
            <span id={`${id}-next-hint`} className="field-hint">{nextHintText(dict, locale, kind, item, draft.doneOn, draft.next, today)}</span>
          </div>
        </section>

        <div className="field">
          <label className="field-label" htmlFor={`${id}-clinic`}>
            {form.clinic}
            <span className="optional">{form.optional}</span>
          </label>
          <input
            id={`${id}-clinic`}
            className="input"
            type="text"
            autoComplete="off"
            maxLength={HEALTH_EVENT_LIMITS.clinic}
            value={draft.clinic}
            readOnly={saving}
            aria-invalid={errors.clinic ? true : undefined}
            aria-describedby={errors.clinic ? `${id}-clinic-error` : undefined}
            onChange={(e) => {
              setDraft({ ...draft, clinic: e.target.value })
              clear('clinic')
            }}
          />
          {errors.clinic && <span id={`${id}-clinic-error`} className="field-error" role="alert">{errors.clinic}</span>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${id}-notes`}>
            {form.notes}
            <span className="optional">{form.optional}</span>
          </label>
          <textarea
            id={`${id}-notes`}
            className="input"
            maxLength={HEALTH_EVENT_LIMITS.notes}
            value={draft.notes}
            readOnly={saving}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={[errors.notes ? `${id}-notes-error` : null, `${id}-notes-count`].filter(Boolean).join(' ')}
            onChange={(e) => {
              setDraft({ ...draft, notes: e.target.value })
              clear('notes')
            }}
          />
          {errors.notes && <span id={`${id}-notes-error`} className="field-error" role="alert">{errors.notes}</span>}
          <span id={`${id}-notes-count`} className="field-hint event-counter">
            {form.counter.replace('{n}', String(draft.notes.length)).replace('{max}', String(HEALTH_EVENT_LIMITS.notes))}
          </span>
        </div>

        <p className="banner event-form-info complete-note">{completionNote(dict, locale, others, draft, today)}</p>
        <p className="field-hint event-form-warning">{words.doneWarning}</p>

        {banner?.kind === 'failure' && (
          <div className="banner error record-form-error event-form-banner" role="alert">
            <p>{completeFailureText(dict, banner.failure)}</p>
            {(banner.failure === 'alreadySaved' || banner.failure === 'gone') && (
              <Link href={medicalRecordHref.section(petId, EVENT_FORM_KINDS[kind].section)} className="link">{form.toSection}</Link>
            )}
          </div>
        )}
        {banner?.kind === 'earlier' && (
          <div className="banner error record-form-error event-form-banner" role="alert">
            <p>{earlierText(dict, banner.mismatch, banner.day)}</p>
            <Link href={medicalRecordHref.recordView(petId, banner.recordId)} className="link">{dict.medicalRecord.eventRecord.openRecord}</Link>
          </div>
        )}

        <div className="form-actions">
          <Link href={back} className="link">{form.cancel}</Link>
          <button ref={submitRef} type="submit" className="btn primary" aria-disabled={saving || undefined}>
            {saving ? form.saving : form.save}
          </button>
        </div>
      </form>

      {confirming && question && (
        // Focus starts on «Проверить ещё раз», Escape closes, and focus returns to «Сохранить».
        <ConfirmDialog
          title={question.title}
          body={question.body}
          cancelLabel={words.confirmCancel}
          confirmLabel={words.confirmAction}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const input = confirming
            setConfirming(null)
            void save(input)
          }}
          returnFocusRef={submitRef}
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

function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}

function Notice({ title, body, href, action }: { title: string; body: string; href: string; action: string }) {
  const ref = useFocusOnMount<HTMLHeadingElement>()
  return (
    <section className="card health-problem" aria-labelledby="complete-notice-title">
      <h1 id="complete-notice-title" ref={ref} tabIndex={-1}>{title}</h1>
      <p>{body}</p>
      <Link href={href} className="btn primary">{action}</Link>
    </section>
  )
}

function FormSkeleton({ label }: { label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="skeleton-block record-form event-skeleton-form" aria-hidden />
    </div>
  )
}
