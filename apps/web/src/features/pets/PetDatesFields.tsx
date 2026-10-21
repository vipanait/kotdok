'use client'

import { useTranslations } from '@/components/LocaleProvider'
import { switchBirthMode, type BirthMode, type PetDatesError, type PetDatesFields as Fields } from './pet-dates-form'

/**
 * «Даты» of the pet form (design `pet-form`): «Знаю дату рождения» or
 * «Примерно» (years and months), and «В семье с». All optional. Each error
 * is tied to its field and read with it.
 */
export default function PetDatesFields({
  idBase,
  fields,
  onChange,
  error,
  today,
}: {
  idBase: string
  fields: Fields
  onChange: (fields: Fields) => void
  error: PetDatesError | null
  today: string
}) {
  const t = useTranslations().pets.dates
  const id = (name: string) => `${idBase}-${name}`
  const errorText = error ? t.errors[error.reason] : ''
  const describe = (field: PetDatesError['field'], hint?: string) =>
    [hint, error?.field === field ? id(`${field}-error`) : null].filter(Boolean).join(' ') || undefined
  const set = (patch: Partial<Fields>) => onChange({ ...fields, ...patch })

  const tab = (mode: BirthMode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={fields.birthMode === mode}
      tabIndex={fields.birthMode === mode ? 0 : -1}
      className="dates-tab"
      onClick={() => onChange(switchBirthMode(fields, mode, today))}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          const next = fields.birthMode === 'exact' ? 'approx' : 'exact'
          onChange(switchBirthMode(fields, next, today))
          ;(event.currentTarget.parentElement?.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus()
        }
      }}
      data-mode={mode}
    >
      {label}
    </button>
  )

  return (
    <div className="pet-dates">
      <div className="dates-tabs" role="radiogroup" aria-label={t.birthLabel}>
        {tab('exact', t.exact)}
        {tab('approx', t.approx)}
      </div>

      <div className="form-grid">
        {fields.birthMode === 'exact' ? (
          <div className="field">
            <label className="field-label" htmlFor={id('birth-date')}>{t.birthDate}</label>
            <input
              id={id('birth-date')}
              type="date"
              className="input"
              max={today}
              value={fields.birthDate}
              onChange={(event) => set({ birthDate: event.target.value })}
              aria-invalid={error?.field === 'birthDate' || undefined}
              aria-describedby={describe('birthDate')}
            />
            {error?.field === 'birthDate' && <span id={id('birthDate-error')} className="field-error" role="alert">{errorText}</span>}
          </div>
        ) : (
          <fieldset className="field dates-approx">
            <legend className="field-label">{t.approxLegend}</legend>
            <div className="dates-approx-row">
              <label>
                <span className="sr-only">{t.years}</span>
                <input
                  id={id('approx-years')}
                  aria-label={`${t.approxLegend}: ${t.years}`}
                  type="text"
                  inputMode="numeric"
                  className="input"
                  value={fields.approxYears}
                  onChange={(event) => set({ approxYears: event.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                  aria-invalid={error?.field === 'approxYears' || undefined}
                  aria-describedby={describe('approxYears')}
                />
                <span aria-hidden>{t.yearsShort}</span>
              </label>
              <label>
                <span className="sr-only">{t.months}</span>
                <input
                  id={id('approx-months')}
                  aria-label={`${t.approxLegend}: ${t.months}`}
                  type="text"
                  inputMode="numeric"
                  className="input"
                  value={fields.approxMonths}
                  onChange={(event) => set({ approxMonths: event.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                  aria-invalid={error?.field === 'approxMonths' || undefined}
                  aria-describedby={describe('approxMonths')}
                />
                <span aria-hidden>{t.monthsShort}</span>
              </label>
            </div>
            {(error?.field === 'approxYears' || error?.field === 'approxMonths') && (
              <span id={id(`${error.field}-error`)} className="field-error" role="alert">{errorText}</span>
            )}
          </fieldset>
        )}

        <div className="field">
          <label className="field-label" htmlFor={id('adopted-on')}>{t.adoptedOn}</label>
          <input
            id={id('adopted-on')}
            type="date"
            className="input"
            max={today}
            value={fields.adoptedOn}
            onChange={(event) => set({ adoptedOn: event.target.value })}
            aria-invalid={error?.field === 'adoptedOn' || undefined}
            aria-describedby={describe('adoptedOn', id('adopted-on-hint'))}
          />
          <span id={id('adopted-on-hint')} className="field-hint">{t.adoptedOnHint}</span>
          {error?.field === 'adoptedOn' && <span id={id('adoptedOn-error')} className="field-error" role="alert">{errorText}</span>}
        </div>
      </div>
      <p className="field-hint">{t.note}</p>
    </div>
  )
}
