'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import AppShell from '@/components/AppShell'
import CatAvatar from '@/components/CatAvatar'
import { csrfHeaders } from '@/shared/security/csrf-client'

type CatFormValues = Omit<Cat, 'id' | 'user_id' | 'created_at'>

type SavedKind = 'created' | 'updated' | 'deleted'

interface Props {
  cat?: Cat
  /** When set, render in modal-mode (no AppShell, compact heading). */
  modal?: boolean
  /**
   * When provided, after a successful save/delete the form invokes this
   * callback instead of navigating to `/dashboard`. The caller is responsible
   * for closing the modal and triggering data refresh.
   */
  onSaved?: (kind: SavedKind) => void
  /** Notifies the parent when the form has unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void
  /** Optional cancel handler (e.g. close modal). Falls back to dashboard link. */
  onCancel?: () => void
}

const NOTES_MAX = 300

function toArr(val: string): string[] {
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

function fromArr(arr: string[]): string {
  return arr.join(', ')
}

/** Keep digits and at most one decimal separator (`.` or `,`). */
function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  const sepIndex = cleaned.search(/[.,]/)
  if (sepIndex === -1) return cleaned
  const intPart = cleaned.slice(0, sepIndex)
  const sep = cleaned[sepIndex]
  const frac = cleaned.slice(sepIndex + 1).replace(/[.,]/g, '')
  return intPart + sep + frac
}

function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export default function CatForm({ cat, modal = false, onSaved, onDirtyChange, onCancel }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.cats
  const isEdit = !!cat

  const [name, setName] = useState(cat?.name ?? '')
  const [breed, setBreed] = useState(cat?.breed ?? '')
  const [ageYears, setAgeYears] = useState(cat?.age_years?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(cat?.weight_kg?.toString() ?? '')
  const [sex, setSex] = useState<Cat['sex']>(cat?.sex ?? null)
  const [neutered, setNeutered] = useState<boolean | null>(cat?.neutered ?? null)
  const [indoorOutdoor, setIndoorOutdoor] = useState<Cat['indoor_outdoor']>(cat?.indoor_outdoor ?? null)
  const [diet, setDiet] = useState<Cat['diet']>(cat?.diet ?? null)
  const [allergies, setAllergies] = useState(fromArr(cat?.allergies ?? []))
  const [vaccinated, setVaccinated] = useState<boolean | null>(cat?.vaccinated ?? null)
  const [chronicConditions, setChronicConditions] = useState(fromArr(cat?.chronic_conditions ?? []))
  const [medications, setMedications] = useState(fromArr(cat?.medications ?? []))
  const [notes, setNotes] = useState(cat?.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [nameError, setNameError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dirty =
    name !== (cat?.name ?? '') ||
    breed !== (cat?.breed ?? '') ||
    ageYears !== (cat?.age_years?.toString() ?? '') ||
    weightKg !== (cat?.weight_kg?.toString() ?? '') ||
    sex !== (cat?.sex ?? null) ||
    neutered !== (cat?.neutered ?? null) ||
    indoorOutdoor !== (cat?.indoor_outdoor ?? null) ||
    diet !== (cat?.diet ?? null) ||
    allergies !== fromArr(cat?.allergies ?? []) ||
    vaccinated !== (cat?.vaccinated ?? null) ||
    chronicConditions !== fromArr(cat?.chronic_conditions ?? []) ||
    medications !== fromArr(cat?.medications ?? []) ||
    notes !== (cat?.notes ?? '')

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!confirmDelete) return

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!deleting) setConfirmDelete(false)
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirmDelete, deleting])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setNameError(t.errorName); return }
    setSaving(true)
    setFormError('')
    setNameError('')

    const body: CatFormValues = {
      name: name.trim(),
      breed: breed.trim() || null,
      age_years: parseDecimal(ageYears),
      weight_kg: parseDecimal(weightKg),
      sex,
      neutered,
      indoor_outdoor: indoorOutdoor,
      diet,
      allergies: toArr(allergies),
      vaccinated,
      chronic_conditions: toArr(chronicConditions),
      medications: toArr(medications),
      notes: notes.trim() || null,
    }

    const url = isEdit ? `/api/cats/${cat!.id}` : '/api/cats'
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      setFormError(data.error || t.errorGeneric)
      setSaving(false)
      return
    }

    const kind: SavedKind = isEdit ? 'updated' : 'created'
    if (onSaved) {
      onSaved(kind)
      router.refresh()
    } else {
      router.push(`/dashboard?catSaved=${kind}`)
      router.refresh()
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/cats/${cat!.id}`, { method: 'DELETE', headers: csrfHeaders() })
    if (onSaved) {
      onSaved('deleted')
      router.refresh()
    } else {
      router.push('/dashboard?catSaved=deleted')
      router.refresh()
    }
  }

  const heading = (
    <div className="flex items-center gap-4 mb-6 sm:mb-8">
      <CatAvatar size={modal ? 56 : 68} />
      <h1 className={modal
        ? 'text-2xl sm:text-3xl font-extrabold text-text leading-tight pr-8'
        : 'text-3xl sm:text-4xl font-extrabold text-text leading-tight'}>
        {isEdit ? cat!.name : t.newTitle}
      </h1>
    </div>
  )

  const cancelControl = onCancel ? (
    <button
      type="button"
      onClick={onCancel}
      className="app-button-secondary flex-1 py-3.5"
    >
      {t.cancelBtn}
    </button>
  ) : (
    <Link href="/dashboard" className="app-button-secondary flex-1 py-3.5 text-center">
      {t.cancelBtn}
    </Link>
  )

  const formBody = (
    <div className={modal ? '' : 'app-card p-6 sm:p-8'}>
      <form onSubmit={handleSubmit} className="space-y-6">
          <FormSection title={t.sectionBasic}>
            <Field label={t.name} error={nameError}>
              <input
                value={name}
                onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
                placeholder={t.namePlaceholder}
                className={inputCls}
                aria-invalid={!!nameError}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label={t.breed}>
                <input
                  value={breed}
                  onChange={e => setBreed(e.target.value)}
                  placeholder={t.breedPlaceholder}
                  className={inputCls}
                />
              </Field>
              <Field label={t.ageYears}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={ageYears}
                  onChange={e => setAgeYears(sanitizeDecimalInput(e.target.value))}
                  placeholder="3"
                  className={inputCls}
                />
              </Field>
              <Field label={t.weightKg}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={weightKg}
                  onChange={e => setWeightKg(sanitizeDecimalInput(e.target.value))}
                  placeholder="4.5"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label={t.sex}>
              <ChoiceChips
                value={sex ?? ''}
                onChange={v => setSex((v || null) as Cat['sex'])}
                options={[
                  { value: 'female', label: t.sexFemale },
                  { value: 'male', label: t.sexMale },
                ]}
                clearLabel={dict.common.notSpecifiedM}
              />
            </Field>

            <Field label={t.neutered}>
              <ChoiceChips
                value={neutered == null ? '' : neutered ? 'yes' : 'no'}
                onChange={v => setNeutered(v === '' ? null : v === 'yes')}
                options={[
                  { value: 'yes', label: dict.common.yes },
                  { value: 'no', label: dict.common.no },
                ]}
                clearLabel={dict.common.notSpecified}
              />
            </Field>
          </FormSection>

          <FormSection title={t.sectionLifestyle}>
            <Field label={t.lifestyle}>
              <ChoiceChips
                value={indoorOutdoor ?? ''}
                onChange={v => setIndoorOutdoor((v || null) as Cat['indoor_outdoor'])}
                options={[
                  { value: 'indoor', label: t.lifestyleIndoor },
                  { value: 'outdoor', label: t.lifestyleOutdoor },
                  { value: 'both', label: t.lifestyleBoth },
                ]}
                clearLabel={dict.common.notSpecifiedM}
              />
            </Field>

            <Field label={t.diet}>
              <ChoiceChips
                value={diet ?? ''}
                onChange={v => setDiet((v || null) as Cat['diet'])}
                options={[
                  { value: 'dry', label: t.dietDry },
                  { value: 'wet', label: t.dietWet },
                  { value: 'mixed', label: t.dietMixed },
                  { value: 'raw', label: t.dietRaw },
                ]}
                clearLabel={dict.common.notSpecified}
              />
            </Field>

            <Field label={t.vaccination}>
              <ChoiceChips
                value={vaccinated == null ? '' : vaccinated ? 'yes' : 'no'}
                onChange={v => setVaccinated(v === '' ? null : v === 'yes')}
                options={[
                  { value: 'yes', label: t.vaccinationYes },
                  { value: 'no', label: t.vaccinationNo },
                ]}
                clearLabel={dict.common.notSpecified}
              />
            </Field>
          </FormSection>

          <FormSection title={t.sectionHealth}>
            <div className="grid gap-5">
              <Field label={t.allergies}>
                <input
                  value={allergies}
                  onChange={e => setAllergies(e.target.value)}
                  placeholder={t.allergiesPlaceholder}
                  className={inputCls}
                />
              </Field>

              <Field label={t.chronicConditions}>
                <input
                  value={chronicConditions}
                  onChange={e => setChronicConditions(e.target.value)}
                  placeholder={t.chronicPlaceholder}
                  className={inputCls}
                />
              </Field>

              <Field label={t.medications}>
                <input
                  value={medications}
                  onChange={e => setMedications(e.target.value)}
                  placeholder={t.medicationsPlaceholder}
                  className={inputCls}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t.sectionNotes}>
            <Field label={t.notes}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))}
                placeholder={t.notesPlaceholder}
                rows={3}
                className="app-input resize-none"
              />
              <p className={`text-xs mt-1 text-right ${notes.length >= NOTES_MAX ? 'text-status-error-fg' : 'text-text-faint'}`}>
                {notes.length}/{NOTES_MAX}
              </p>
            </Field>
          </FormSection>

          {formError && <div className="bg-status-error-bg text-status-error-fg text-sm rounded-xl px-4 py-3">{formError}</div>}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="rounded-full border border-status-error-bg px-5 py-3.5 text-sm font-semibold text-status-error-fg transition-colors hover:bg-status-error-bg/40 disabled:opacity-50 sm:mr-auto"
              >
                {deleting ? t.deletingBtn : t.deleteBtn}
              </button>
            )}
            {cancelControl}
            <button
              type="submit"
              disabled={saving}
              className="app-button-primary flex-1 py-3.5"
            >
              {saving ? t.savingBtn : isEdit ? t.saveBtn : t.addBtn}
            </button>
          </div>
      </form>
    </div>
  )

  const deleteDialog = confirmDelete && isEdit && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-cat-title"
      className="app-overlay fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget && !deleting) setConfirmDelete(false) }}
    >
      <div className="app-card w-full rounded-b-none p-6 sm:max-w-sm sm:rounded-b-3xl">
        <h2 id="delete-cat-title" className="text-lg font-bold text-text mb-2">
          {t.confirmDeleteTitle.replace('{name}', cat!.name)}
        </h2>
        <p className="text-sm text-text-muted mb-5">{t.confirmDeleteBody}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
            className="app-button-secondary flex-1 py-3 text-sm"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="app-button-danger flex-1 py-3 text-sm"
          >
            {deleting ? t.deletingBtn : t.deleteBtn}
          </button>
        </div>
      </div>
    </div>
  )

  if (modal) {
    return (
      <div className="p-6 sm:p-8">
        {heading}
        {formBody}
        {deleteDialog}
      </div>
    )
  }

  return (
    <AppShell width="wide" right={
      <Link href="/dashboard" className="app-link">{dict.common.back}</Link>
    }>
      {heading}
      {formBody}
      {deleteDialog}
    </AppShell>
  )
}

const inputCls = 'app-input py-2.5'

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="app-form-section">
      <h2 className="app-form-section-title">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="block">
      <p className="block text-sm font-semibold text-text mb-1.5">{label}</p>
      {children}
      {error && <span className="app-field-error block">{error}</span>}
    </div>
  )
}

function ChoiceChips({
  value,
  onChange,
  options,
  clearLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  clearLabel: string
}) {
  const items = [{ value: '', label: clearLabel }, ...options]
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {items.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value || 'clear'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3.5 py-2 text-sm transition-colors ${
              active
                ? 'bg-accent text-white font-semibold shadow-sm'
                : 'bg-card border border-hairline text-text-muted hover:border-card-soft-strong hover:text-text'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
