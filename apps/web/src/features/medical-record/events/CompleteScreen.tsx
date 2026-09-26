'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HEALTH_EVENT_LIMITS, type HealthEvent, type HealthItem } from '@lapka/contracts'
import { completionMismatch, localToday, nextDayMin, type CompletionMismatch } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import { useSaveKey } from '@/features/forms/save-key'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { RecordProblem } from '../MedicalRecordScreen'
import { recordCache } from '../record-load'
import { medicalRecordHref, type CompleteFrom } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import { eventItemName } from '../view-model'
import {
  changeDoneDay,
  completeDraft,
  completionChanged,
  completionTarget,
  keptFromPlan,
  othersInPlan,
  readCompletion,
  type CompleteDraft,
  type CompleteProblems,
} from './complete-form'
import { completeErrorTexts, completeFailureText, completionNote, earlierText, nextHint, planDayText } from './complete-form-text'
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
 * After «Сделано»: the list it was pressed in, with the confirmation; from
 * the plan or the record page, the done record itself — read-only from now on.
 */
function savedHref(petId: string, savedId: string, kind: EventFormKind, from: CompleteFrom): string {
  if (from === 'due') return `${medicalRecordHref.due(petId)}?saved=completed`
  if (from === 'section') return `${medicalRecordHref.section(petId, EVENT_FORM_KINDS[kind].section)}?saved=completed`
  return `${medicalRecordHref.recordView(petId, savedId)}?saved=completed`
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
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }

  const { overview } = state.data
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
  if (target.kind === 'missing') {
    return (
      <Notice
        title={dict.medicalRecord.completeForm.missingTitle}
        body={dict.medicalRecord.completeForm.missingBody}
        href={medicalRecordHref.recordView(petId, plan.id)}
        action={dict.medicalRecord.eventRecord.openRecord}
      />
    )
  }
  if (target.kind === 'choose') {
    return <ChooseItem petId={petId} plan={plan} items={target.items} from={from} petName={overview.pet.name} dict={dict} />
  }
  // Keyed by the item: another item of the same plan starts from its own values.
  return (
    <CompleteItemForm
      key={target.item.id}
      petId={petId}
      petName={overview.pet.name}
      plan={plan}
      item={target.item}
      from={from}
      today={today}
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
}: {
  petId: string
  petName: string
  plan: HealthEvent
  item: HealthItem
  from: CompleteFrom
  today: string
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
  const inFlight = useRef(false)

  const back = backHref(petId, plan.id, kind, from)
  const dirty = completionChanged(initial, draft)
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving)
  const errors = completeErrorTexts(dict, problems)
  const others = othersInPlan(plan, item)
  const kept = keptFromPlan(plan, item, draft)
  const name = eventItemName(dict, kind, item)

  function clear(field: keyof CompleteProblems) {
    if (problems[field]) setProblems((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
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

    inFlight.current = true
    setSaving(true)
    setProblems({})
    setBanner(null)
    try {
      // One key for this «Сделано» however many times it is sent: a retry after
      // a lost answer finds the record the first try made.
      const api = browserApi()
      const saved = await api.completeHealthItem(petId, item.id, read.input, saveKey.current())
      recordCache.forget(petId)
      // A 200 is not success by itself: an item already done is answered with
      // the record as first saved. Its next plan is checked when the record
      // can be read; if not, the day alone decides.
      const events = await api.getHealthOverview(petId).then((overview) => overview.events, () => null)
      const mismatch = completionMismatch(read.input, saved, item.id, events)
      if (mismatch) {
        inFlight.current = false
        setSaving(false)
        setBanner({ kind: 'earlier', mismatch, recordId: saved.id, day: saved.date })
        return
      }
      saveKey.renew()
      leave(savedHref(petId, saved.id, kind, from))
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
            <span id={`${id}-next-hint`} className="field-hint">{nextHint(dict, locale, item)}</span>
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
            aria-describedby={[errors.clinic ? `${id}-clinic-error` : null, kept.clinic ? `${id}-clinic-kept` : null].filter(Boolean).join(' ') || undefined}
            onChange={(e) => {
              setDraft({ ...draft, clinic: e.target.value })
              clear('clinic')
            }}
          />
          {errors.clinic && <span id={`${id}-clinic-error`} className="field-error" role="alert">{errors.clinic}</span>}
          {/* The server keeps the plan's clinic when none is sent: said, not hidden. */}
          {kept.clinic && (
            <span id={`${id}-clinic-kept`} className="field-hint complete-kept">{words.keptClinic.replace('{text}', kept.clinic)}</span>
          )}
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
            aria-describedby={[errors.notes ? `${id}-notes-error` : null, kept.notes ? `${id}-notes-kept` : null, `${id}-notes-count`].filter(Boolean).join(' ')}
            onChange={(e) => {
              setDraft({ ...draft, notes: e.target.value })
              clear('notes')
            }}
          />
          {errors.notes && <span id={`${id}-notes-error`} className="field-error" role="alert">{errors.notes}</span>}
          {kept.notes && <span id={`${id}-notes-kept`} className="field-hint complete-kept">{words.keptNotes}</span>}
          <span id={`${id}-notes-count`} className="field-hint event-counter">
            {form.counter.replace('{n}', String(draft.notes.length)).replace('{max}', String(HEALTH_EVENT_LIMITS.notes))}
          </span>
        </div>

        <p className="banner event-form-info complete-note">{completionNote(dict, locale, others, draft, today)}</p>
        <p className="field-hint event-form-warning">{form.doneWarning}</p>

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
          <button type="submit" className="btn primary" aria-disabled={saving || undefined}>
            {saving ? form.saving : form.save}
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
