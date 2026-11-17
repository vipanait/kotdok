'use client'

import { HEALTH_EVENT_LIMITS, type HealthTarget, type PetSpecies } from '@lapka/contracts'
import { PARASITE_GROUPS, nextDayMin, parasiteGroups, toggleParasiteGroup, vaccineTargetsFor } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { followSuggestion, toggleTarget, type EventDraft, type EventFormKind, type ItemDraft } from './event-form'
import { nextHintText, type ItemErrorTexts } from './event-form-text'

export type TargetChoice = {
  value: string
  label: string
  pressed: (item: ItemDraft) => boolean
  toggle: (item: ItemDraft) => ItemDraft
}

/**
 * The diseases or parasite groups an item is chosen by: a vaccination's
 * targets for the species (core first), a treatment's three groups. A
 * toggle moves the next date the owner has not set (the usual interval
 * depends on them).
 */
export function targetChoicesFor(
  words: Dictionary['medicalRecord'],
  kind: EventFormKind,
  species: PetSpecies,
  draft: Pick<EventDraft, 'kind' | 'status' | 'date'>,
  today: string,
): TargetChoice[] {
  return kind === 'vaccination'
    ? vaccineTargetsFor(species).map((code) => ({
        value: code,
        label: (words.targets as Record<string, string>)[code] ?? code,
        pressed: (item) => item.targets.includes(code),
        toggle: (item) => followSuggestion(toggleTarget(item, code), draft, today),
      }))
    : PARASITE_GROUPS.map((group) => ({
        value: group,
        label: words.parasiteGroups[group],
        pressed: (item) => parasiteGroups(item.targets).includes(group),
        // Worms alone or not changes the usual interval of an item without its own.
        toggle: (item) => followSuggestion({ ...item, targets: toggleParasiteGroup(item.targets, group) as HealthTarget[] }, draft, today),
      }))
}

/**
 * One item of a vaccination or treatment: its name (typed, or the product's
 * as a heading), its diseases as the existing multi-select chips, and — on a
 * done record — its next date with the interval's hint. The event form and
 * the edit of a recognised entry (DOC-2) both draw it, so both keep the same
 * fields and rules.
 */
export default function EventItemCard({
  idBase,
  kind,
  species,
  item,
  draft,
  today,
  errors,
  saving,
  onChange,
  onRemove,
}: {
  /** The form's own id: the fields are `${idBase}-${item.key}-…`, as focus and errors find them. */
  idBase: string
  kind: EventFormKind
  species: PetSpecies
  item: ItemDraft
  draft: Pick<EventDraft, 'kind' | 'status' | 'date'>
  today: string
  errors: ItemErrorTexts
  saving: boolean
  onChange: (change: (item: ItemDraft) => ItemDraft) => void
  /** Removing the item; none where the item is the whole record. */
  onRemove?: () => void
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.medicalRecord
  const form = words.eventForm
  const kindWords = form[kind]
  const id = `${idBase}-${item.key}`
  const done = draft.status === 'done'
  const title = item.source === 'none' ? form.noProductTitle : item.name.trim() || form.nameLabel
  const targetsId = `${id}-targets`
  const choices = targetChoicesFor(words, kind, species, draft, today)

  return (
    <section id={`${id}-item`} tabIndex={-1} className="event-item" aria-label={title}>
      <div className="event-item-head">
        {item.source === 'manual' ? (
          <div className="field event-item-name">
            <label className="field-label" htmlFor={`${id}-name`}>{form.nameLabel}</label>
            <input
              id={`${id}-name`}
              className="input"
              type="text"
              autoComplete="off"
              maxLength={HEALTH_EVENT_LIMITS.itemName}
              value={item.name}
              readOnly={saving}
              aria-required="true"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${id}-name-error` : undefined}
              onChange={(e) => onChange((current) => ({ ...current, name: e.target.value }))}
            />
            {errors.name && (
              <span id={`${id}-name-error`} className="field-error" role="alert">{errors.name}</span>
            )}
          </div>
        ) : (
          <h3 className="event-item-title">{title}</h3>
        )}
        {onRemove && (
          <button
            type="button"
            className="icon-button event-item-remove"
            aria-label={form.removeItem.replace('{name}', title)}
            disabled={saving}
            onClick={onRemove}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      {item.source === 'none' && <p className="field-hint event-item-hint">{form.noProductHint}</p>}

      <span id={`${targetsId}-label`} className="chip-group-label">{kindWords.targetsLabel}</span>
      <div
        id={targetsId}
        className="chips"
        role="group"
        tabIndex={-1}
        aria-labelledby={`${targetsId}-label`}
        aria-describedby={errors.targets ? `${targetsId}-error` : undefined}
      >
        {choices.map((choice, index) => (
          <button
            key={choice.value}
            id={index === 0 ? `${targetsId}-first` : undefined}
            type="button"
            className="chip"
            aria-pressed={choice.pressed(item)}
            disabled={saving}
            onClick={() => onChange(choice.toggle)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {errors.targets && <span id={`${targetsId}-error`} className="field-error event-targets-error" role="alert">{errors.targets}</span>}

      {done && (
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
              value={item.next}
              min={nextDayMin(draft.date, today)}
              readOnly={saving}
              aria-invalid={errors.next ? true : undefined}
              aria-describedby={[errors.next ? `${id}-next-error` : null, `${id}-next-hint`].filter(Boolean).join(' ')}
              onChange={(e) => onChange((current) => ({ ...current, next: e.target.value, nextTouched: true }))}
            />
            {item.next !== '' && (
              <button
                type="button"
                className="link event-next-clear"
                disabled={saving}
                onClick={() => onChange((current) => ({ ...current, next: '', nextTouched: true }))}
              >
                {form.clearNext}
              </button>
            )}
          </div>
          {errors.next && (
            <span id={`${id}-next-error`} className="field-error" role="alert">{errors.next}</span>
          )}
          <span id={`${id}-next-hint`} className="field-hint">
            {nextHintText(dict, locale, kind, item, draft.date, item.next, today)}
          </span>
        </div>
      )}
    </section>
  )
}
