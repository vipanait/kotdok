'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HEALTH_EVENT_LIMITS, type HealthEvent, type HealthTarget, type PetSpecies } from '@lapka/contracts'
import { PARASITE_GROUPS, parasiteGroups, toggleParasiteGroup, vaccineTargetsFor } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import { useSaveKey } from '@/features/forms/save-key'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { recordCache } from '../record-load'
import { medicalRecordHref } from '../stage'
import CatalogCombobox from './CatalogCombobox'
import {
  EVENT_FORM_KINDS,
  blankEventDraft,
  changeDate,
  draftChanged,
  draftFromPlan,
  eventSaveFailure,
  manualItem,
  noProductItem,
  productItem,
  readNewEvent,
  readPlanChange,
  switchStatus,
  toggleTarget,
  type EventDraft,
  type EventFormKind,
  type EventProblems,
  type EventSaveFailure,
  type ItemDraft,
} from './event-form'
import { eventErrorTexts, eventFailureText } from './event-form-text'

type Banner = { failure: Exclude<EventSaveFailure, 'deleting'> }

/**
 * A new vaccination (MW-04: a treatment, `kind="parasite"`), or a plan being
 * corrected — web v1 «vaccine-done», «vaccine-plan», «catalog»,
 * «catalog-error», «dog-vaccine», «manual», «targets», «save-error».
 *
 * Several items in one record: each is a catalogue product, the owner's own
 * name or «Без препарата», with its own diseases and — on a done record —
 * its own next date, which the catalogue interval only suggests. «Своё
 * название» and «Без препарата» are item cards inside the form, not pages of
 * their own: the rest of the form stays as it is.
 *
 * Saving: one Idempotency-Key per form (`useSaveKey`), so pressing again,
 * or retrying after «нет связи», never makes a second record. A failure keeps
 * every field and says why above the form; the button works again. Success
 * shows the saved record — a done one is read-only from then on.
 */
export default function EventForm({
  petId,
  petName,
  species,
  kind,
  plan,
  today,
}: {
  petId: string
  petName: string
  species: PetSpecies
  kind: EventFormKind
  /** The plan being corrected; null for a new record. Never a done record. */
  plan: HealthEvent | null
  today: string
}) {
  const dict = useTranslations()
  const router = useRouter()
  const words = dict.medicalRecord
  const form = words.eventForm
  const kindWords = form[kind]
  const id = useId()
  const saveKey = useSaveKey()

  const [initial] = useState<EventDraft>(() => (plan ? draftFromPlan(plan) : blankEventDraft(kind, 'done', today)))
  const [draft, setDraft] = useState<EventDraft>(initial)
  const [problems, setProblems] = useState<EventProblems>({})
  const [banner, setBanner] = useState<Banner | null>(null)
  const [saving, setSaving] = useState(false)

  const inFlight = useRef(false)
  const nextKey = useRef(0)
  const comboboxRef = useRef<HTMLInputElement>(null)

  const sectionHref = medicalRecordHref.section(petId, EVENT_FORM_KINDS[kind].section)
  const backHref = plan ? medicalRecordHref.recordView(petId, plan.id) : sectionHref
  const dirty = draftChanged(initial, draft)
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !saving)

  const errors = eventErrorTexts(dict, kind, problems)
  const done = draft.status === 'done'
  const full = draft.items.length >= HEALTH_EVENT_LIMITS.items

  function update(next: EventDraft) {
    setDraft(next)
  }

  function updateItem(key: string, change: (item: ItemDraft) => ItemDraft) {
    setDraft((current) => ({ ...current, items: current.items.map((item) => (item.key === key ? change(item) : item)) }))
    setProblems((current) => {
      if (!current.item?.[key]) return current
      const rest = { ...current.item }
      delete rest[key]
      return { ...current, item: rest }
    })
  }

  function addItem(item: ItemDraft, focusId?: string) {
    setDraft((current) => ({ ...current, items: [...current.items, item] }))
    setProblems((current) => ({ ...current, items: undefined }))
    if (focusId) window.setTimeout(() => document.getElementById(focusId)?.focus(), 0)
  }

  const newKey = () => `new-${nextKey.current++}`

  function removeItem(key: string) {
    setDraft((current) => ({ ...current, items: current.items.filter((item) => item.key !== key) }))
    // Focus does not fall to the page: back to the search, where another item is added.
    comboboxRef.current?.focus()
  }

  /** Where the first problem is, so focus lands on it. */
  function firstProblemId(found: EventProblems): string | null {
    if (found.date) return `${id}-date`
    if (found.items) return comboboxRef.current?.id ?? null
    for (const item of draft.items) {
      const own = found.item?.[item.key]
      if (!own) continue
      if (own.name) return `${id}-${item.key}-name`
      if (own.targets) return `${id}-${item.key}-targets`
      if (own.next) return `${id}-${item.key}-next`
    }
    if (found.clinic) return `${id}-clinic`
    if (found.notes) return `${id}-notes`
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return

    const read = plan ? readPlanChange(plan, draft, today) : readNewEvent(draft, today)
    if (!read.ok) {
      setProblems(read.problems)
      setBanner(null)
      const target = firstProblemId(read.problems)
      if (target) document.getElementById(target)?.focus()
      return
    }
    if ('patch' in read && read.patch === null) {
      leave(backHref)
      return
    }

    inFlight.current = true
    setSaving(true)
    setProblems({})
    setBanner(null)
    try {
      const api = browserApi()
      const saved =
        plan && 'patch' in read && read.patch
          ? await api.changeHealthEvent(petId, plan.id, read.patch)
          : 'input' in read
            ? await api.createHealthEvent(petId, read.input, saveKey.current())
            : null
      if (!saved) throw new Error('nothing to send')
      // The next save of this form would be a new record.
      saveKey.renew()
      recordCache.forget(petId)
      leave(`${medicalRecordHref.recordView(petId, saved.id)}?saved=${plan ? 'changed' : 'added'}`)
    } catch (error) {
      inFlight.current = false
      setSaving(false)
      const failure = eventSaveFailure(error)
      if (failure !== 'offline') console.warn('[medical-record] record save failed', error)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      // Said above the form (role=alert); focus stays on «Сохранить» for the retry.
      setBanner({ failure })
    }
  }

  const targetChoices: Array<{ value: string; label: string; pressed: (item: ItemDraft) => boolean; toggle: (item: ItemDraft) => ItemDraft }> =
    kind === 'vaccination'
      ? vaccineTargetsFor(species).map((code) => ({
          value: code,
          label: (words.targets as Record<string, string>)[code] ?? code,
          pressed: (item) => item.targets.includes(code),
          toggle: (item) => toggleTarget(item, code),
        }))
      : PARASITE_GROUPS.map((group) => ({
          value: group,
          label: words.parasiteGroups[group],
          pressed: (item) => parasiteGroups(item.targets).includes(group),
          toggle: (item) => ({ ...item, targets: toggleParasiteGroup(item.targets, group) as HealthTarget[] }),
        }))

  return (
    <div className="health-page event-form-page">
      <div className="pagehead">
        <div>
          <h1>{plan ? kindWords.editTitle : kindWords.addTitle}</h1>
          <p>{`${petName} · ${words.animal[species].unknown}`}</p>
        </div>
        <Link href={backHref} className="link">
          <Icon name="back" />
          {plan ? form.toRecord : form.toSection}
        </Link>
      </div>

      <form className="card record-form event-form" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        {!plan && (
          <div className="segmented event-status" role="group" aria-label={form.statusLabel}>
            {(['done', 'planned'] as const).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={draft.status === status}
                disabled={saving}
                onClick={() => {
                  update(switchStatus(draft, status, today))
                  setProblems((current) => ({ ...current, date: undefined }))
                }}
              >
                {status === 'done' ? form.done : form.planned}
              </button>
            ))}
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor={`${id}-date`}>{done ? form.whenDone : form.whenPlanned}</label>
          <input
            id={`${id}-date`}
            className="input"
            type="date"
            value={draft.date}
            max={done ? today : undefined}
            min={done ? undefined : today}
            readOnly={saving}
            aria-required="true"
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? `${id}-date-error` : undefined}
            onChange={(e) => {
              update(changeDate(draft, e.target.value, today))
              if (problems.date) setProblems((current) => ({ ...current, date: undefined }))
            }}
          />
          {errors.date && <span id={`${id}-date-error`} className="field-error" role="alert">{errors.date}</span>}
        </div>

        <fieldset className="event-items" aria-describedby={errors.items ? `${id}-items-error` : undefined}>
          <legend className="event-items-title">{kindWords.items}</legend>

          {!full && (
            <CatalogCombobox
              key={`${petId}-${species}`}
              species={species}
              productKind={EVENT_FORM_KINDS[kind].product}
              label={words.catalog.label}
              inputRef={comboboxRef}
              disabled={saving}
              onPick={(product) => addItem(productItem(newKey(), product, draft, today))}
              onManual={(typed) => {
                const key = newKey()
                addItem(manualItem(key, typed), `${id}-${key}-name`)
              }}
              onNoProduct={() => {
                const key = newKey()
                addItem(noProductItem(key), `${id}-${key}-targets-first`)
              }}
            />
          )}
          {errors.items && <span id={`${id}-items-error`} className="field-error" role="alert">{errors.items}</span>}

          {draft.items.map((item) => {
            const itemErrors = errors.item[item.key] ?? {}
            const title = item.source === 'none' ? form.noProductTitle : item.name.trim() || form.nameLabel
            const targetsId = `${id}-${item.key}-targets`
            return (
              <section key={item.key} className="event-item" aria-label={title}>
                <div className="event-item-head">
                  {item.source === 'manual' ? (
                    <div className="field event-item-name">
                      <label className="field-label" htmlFor={`${id}-${item.key}-name`}>{form.nameLabel}</label>
                      <input
                        id={`${id}-${item.key}-name`}
                        className="input"
                        type="text"
                        autoComplete="off"
                        maxLength={HEALTH_EVENT_LIMITS.itemName}
                        value={item.name}
                        readOnly={saving}
                        aria-required="true"
                        aria-invalid={itemErrors.name ? true : undefined}
                        aria-describedby={itemErrors.name ? `${id}-${item.key}-name-error` : undefined}
                        onChange={(e) => updateItem(item.key, (current) => ({ ...current, name: e.target.value }))}
                      />
                      {itemErrors.name && (
                        <span id={`${id}-${item.key}-name-error`} className="field-error" role="alert">{itemErrors.name}</span>
                      )}
                    </div>
                  ) : (
                    <h3 className="event-item-title">{title}</h3>
                  )}
                  <button
                    type="button"
                    className="icon-button event-item-remove"
                    aria-label={form.removeItem.replace('{name}', title)}
                    disabled={saving}
                    onClick={() => removeItem(item.key)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                {item.source === 'none' && <p className="field-hint event-item-hint">{form.noProductHint}</p>}

                <span id={`${targetsId}-label`} className="chip-group-label">{kindWords.targetsLabel}</span>
                <div
                  id={targetsId}
                  className="chips"
                  role="group"
                  tabIndex={-1}
                  aria-labelledby={`${targetsId}-label`}
                  aria-describedby={itemErrors.targets ? `${targetsId}-error` : undefined}
                >
                  {targetChoices.map((choice, index) => (
                    <button
                      key={choice.value}
                      id={index === 0 ? `${targetsId}-first` : undefined}
                      type="button"
                      className="chip"
                      aria-pressed={choice.pressed(item)}
                      disabled={saving}
                      onClick={() => updateItem(item.key, choice.toggle)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                {itemErrors.targets && <span id={`${targetsId}-error`} className="field-error event-targets-error" role="alert">{itemErrors.targets}</span>}

                {done && (
                  <div className="field event-item-next">
                    <label className="field-label" htmlFor={`${id}-${item.key}-next`}>
                      {form.nextLabel}
                      <span className="optional">{form.optional}</span>
                    </label>
                    <div className="event-next-row">
                      <input
                        id={`${id}-${item.key}-next`}
                        className="input"
                        type="date"
                        value={item.next}
                        min={draft.date && draft.date >= today ? draft.date : today}
                        readOnly={saving}
                        aria-invalid={itemErrors.next ? true : undefined}
                        aria-describedby={[itemErrors.next ? `${id}-${item.key}-next-error` : null, `${id}-${item.key}-next-hint`].filter(Boolean).join(' ')}
                        onChange={(e) => updateItem(item.key, (current) => ({ ...current, next: e.target.value, nextTouched: true }))}
                      />
                      {item.next !== '' && (
                        <button
                          type="button"
                          className="link event-next-clear"
                          disabled={saving}
                          onClick={() => updateItem(item.key, (current) => ({ ...current, next: '', nextTouched: true }))}
                        >
                          {form.clearNext}
                        </button>
                      )}
                    </div>
                    {itemErrors.next && (
                      <span id={`${id}-${item.key}-next-error`} className="field-error" role="alert">{itemErrors.next}</span>
                    )}
                    <span id={`${id}-${item.key}-next-hint`} className="field-hint">
                      {item.source === 'catalog' ? form.nextHint : `${form.nextHint} ${form.nextManualHint}`}
                    </span>
                  </div>
                )}
              </section>
            )
          })}

          {!full && draft.items.length > 0 && (
            <button
              type="button"
              className="link event-add-item"
              disabled={saving}
              onClick={() => comboboxRef.current?.focus()}
            >
              <Icon name="plus" />
              {kindWords.addItem}
            </button>
          )}
        </fieldset>

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
            onChange={(e) => update({ ...draft, clinic: e.target.value })}
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
            onChange={(e) => update({ ...draft, notes: e.target.value })}
          />
          {errors.notes && <span id={`${id}-notes-error`} className="field-error" role="alert">{errors.notes}</span>}
          <span id={`${id}-notes-count`} className="field-hint event-counter">
            {form.counter.replace('{n}', String(draft.notes.length)).replace('{max}', String(HEALTH_EVENT_LIMITS.notes))}
          </span>
        </div>

        {!plan && <p className="banner event-form-info">{done ? form.doneInfo : form.planInfo}</p>}
        {!plan && done && <p className="field-hint event-form-warning">{form.doneWarning}</p>}

        {/* Beside the button that was pressed, so a long form does not hide it. */}
        {banner && (
          <div className="banner error record-form-error event-form-banner" role="alert">
            <p>{eventFailureText(dict, banner.failure)}</p>
            {banner.failure === 'alreadySaved' && (
              <Link href={sectionHref} className="link">{form.toSection}</Link>
            )}
            {banner.failure === 'done' && plan && (
              <Link href={medicalRecordHref.recordView(petId, plan.id)} className="link">{words.eventRecord.openRecord}</Link>
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
