'use client'

import { MEDICATION_LIMITS } from '@lapka/contracts'
import { endsByToday } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import type { CourseDraft, CourseProblems } from './course-form'
import type { CourseErrorTexts } from './course-form-text'

/**
 * One course's fields: the name, «Как давать», the start, «Постоянно» and
 * the end. The medicine form and the edit of a course recognised from a
 * prescription (DOC-2) both draw it, so both keep the same fields and rules.
 */
export default function CourseFields({
  idBase,
  draft,
  title,
  errors: own,
  startOptional,
  today,
  saving,
  onChange,
  onRemove,
}: {
  /** The form's own id: the fields are `${idBase}-${draft.key}-…`, as focus and errors find them. */
  idBase: string
  draft: CourseDraft
  /** What the course is called to a screen reader. */
  title: string
  errors: CourseErrorTexts
  /** A course whose start nobody knows may keep it empty. */
  startOptional: boolean
  today: string
  saving: boolean
  /** A change, and which problems it clears. */
  onChange: (patch: Partial<CourseDraft>, cleared: (keyof CourseProblems)[]) => void
  onRemove?: () => void
}) {
  const form = useTranslations().medicalRecord.courseForm
  const fieldId = (field: string) => `${idBase}-${draft.key}-${field}`
  const endsNow = endsByToday(draft, today)
  return (
    <section className="event-item course-item" aria-label={title}>
      <div className="event-item-head">
        <h3 className="event-item-title">{form.itemTitle}</h3>
        {onRemove && (
          <button
            type="button"
            className="icon-button event-item-remove"
            aria-label={form.remove.replace('{name}', title)}
            disabled={saving}
            onClick={onRemove}
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={fieldId('name')}>{form.name}</label>
        <input
          id={fieldId('name')}
          className="input"
          type="text"
          autoComplete="off"
          maxLength={MEDICATION_LIMITS.name}
          value={draft.name}
          readOnly={saving}
          aria-required="true"
          aria-invalid={own.name ? true : undefined}
          aria-describedby={own.name ? fieldId('name-error') : undefined}
          onChange={(e) => onChange({ name: e.target.value }, ['name'])}
        />
        {own.name && <span id={fieldId('name-error')} className="field-error" role="alert">{own.name}</span>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={fieldId('dosage')}>
          {form.dosage}
          <span className="optional">{form.optional}</span>
        </label>
        <input
          id={fieldId('dosage')}
          className="input"
          type="text"
          autoComplete="off"
          maxLength={MEDICATION_LIMITS.dosage}
          placeholder={form.dosagePlaceholder}
          value={draft.dosage}
          readOnly={saving}
          aria-invalid={own.dosage ? true : undefined}
          aria-describedby={own.dosage ? fieldId('dosage-error') : undefined}
          onChange={(e) => onChange({ dosage: e.target.value }, ['dosage'])}
        />
        {own.dosage && <span id={fieldId('dosage-error')} className="field-error" role="alert">{own.dosage}</span>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={fieldId('start')}>
          {form.start}
          {startOptional && <span className="optional">{form.optional}</span>}
        </label>
        <input
          id={fieldId('start')}
          className="input"
          type="date"
          value={draft.start}
          readOnly={saving}
          aria-required={startOptional ? undefined : 'true'}
          aria-invalid={own.start ? true : undefined}
          aria-describedby={
            [own.start ? fieldId('start-error') : null, startOptional ? fieldId('start-hint') : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={(e) => onChange({ start: e.target.value }, ['start', 'end'])}
        />
        {own.start && <span id={fieldId('start-error')} className="field-error" role="alert">{own.start}</span>}
        {startOptional && <span id={fieldId('start-hint')} className="field-hint">{form.startUnknownHint}</span>}
      </div>

      <label className="check-row course-ongoing">
        <input
          type="checkbox"
          checked={draft.ongoing}
          disabled={saving}
          onChange={(e) => onChange({ ongoing: e.target.checked }, ['end'])}
        />
        {form.ongoing}
      </label>

      {/* «Постоянно»: no end — the field is gone and nothing is sent for it. */}
      {!draft.ongoing && (
        <div className="field">
          <label className="field-label" htmlFor={fieldId('end')}>
            {form.end}
            <span className="optional">{form.optional}</span>
          </label>
          <input
            id={fieldId('end')}
            className="input"
            type="date"
            value={draft.end}
            min={draft.start || undefined}
            readOnly={saving}
            aria-invalid={own.end ? true : undefined}
            aria-describedby={
              [own.end ? fieldId('end-error') : null, endsNow ? fieldId('end-hint') : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            onChange={(e) => onChange({ end: e.target.value }, ['end'])}
          />
          {own.end && <span id={fieldId('end-error')} className="field-error" role="alert">{own.end}</span>}
          {endsNow && <span id={fieldId('end-hint')} className="field-hint course-ends-now">{form.endsNow}</span>}
        </div>
      )}
    </section>
  )
}
