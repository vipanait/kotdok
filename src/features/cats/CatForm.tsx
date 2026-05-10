'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import AppShell from '@/components/AppShell'
import CatAvatar from '@/components/CatAvatar'
import { csrfHeaders } from '@/shared/security/csrf-client'

type CatFormValues = Omit<Cat, 'id' | 'user_id' | 'created_at'>

interface Props {
  cat?: Cat
}

const NOTES_MAX = 300

function toArr(val: string): string[] {
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

function fromArr(arr: string[]): string {
  return arr.join(', ')
}

export default function CatForm({ cat }: Props) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setNameError(t.errorName); return }
    setSaving(true)
    setFormError('')
    setNameError('')

    const body: CatFormValues = {
      name: name.trim(),
      breed: breed.trim() || null,
      age_years: ageYears !== '' ? Number(ageYears) : null,
      weight_kg: weightKg !== '' ? Number(weightKg) : null,
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

    router.push(`/dashboard?catSaved=${isEdit ? 'updated' : 'created'}`)
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/cats/${cat!.id}`, { method: 'DELETE', headers: csrfHeaders() })
    router.push('/dashboard?catSaved=deleted')
    router.refresh()
  }

  return (
    <AppShell width="wide" right={
      <Link href="/dashboard" className="app-link">{dict.common.back}</Link>
    }>
      <div className="flex items-end gap-5 mb-6 sm:mb-8">
        <CatAvatar size={72} />
        <div>
          <p className="app-kicker">{t.kicker}</p>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-text leading-none mt-1">
            {isEdit ? `${t.editTitlePrefix}: ${cat!.name}` : t.newTitle}
          </h1>
          <p className="text-xs text-text-muted mt-2">{t.profileSubheading}</p>
        </div>
      </div>

      <div className="app-card p-6 sm:p-8">
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
                  type="number"
                  min="0"
                  max="30"
                  step="0.5"
                  value={ageYears}
                  onChange={e => setAgeYears(e.target.value)}
                  placeholder="3"
                  className={inputCls}
                />
              </Field>
              <Field label={t.weightKg}>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
                  placeholder="4.5"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t.sex}>
                <select
                  value={sex ?? ''}
                  onChange={e => setSex((e.target.value || null) as Cat['sex'])}
                  className={inputCls}
                >
                  <option value="">{dict.common.notSpecifiedM}</option>
                  <option value="female">{t.sexFemale}</option>
                  <option value="male">{t.sexMale}</option>
                </select>
              </Field>
              <Field label={t.neutered}>
                <select
                  value={neutered == null ? '' : neutered ? 'yes' : 'no'}
                  onChange={e => setNeutered(e.target.value === '' ? null : e.target.value === 'yes')}
                  className={inputCls}
                >
                  <option value="">{dict.common.notSpecified}</option>
                  <option value="yes">{dict.common.yes}</option>
                  <option value="no">{dict.common.no}</option>
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t.sectionLifestyle}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label={t.lifestyle}>
                <select
                  value={indoorOutdoor ?? ''}
                  onChange={e => setIndoorOutdoor((e.target.value || null) as Cat['indoor_outdoor'])}
                  className={inputCls}
                >
                  <option value="">{dict.common.notSpecifiedM}</option>
                  <option value="indoor">{t.lifestyleIndoor}</option>
                  <option value="outdoor">{t.lifestyleOutdoor}</option>
                  <option value="both">{t.lifestyleBoth}</option>
                </select>
              </Field>
              <Field label={t.diet}>
                <select
                  value={diet ?? ''}
                  onChange={e => setDiet((e.target.value || null) as Cat['diet'])}
                  className={inputCls}
                >
                  <option value="">{dict.common.notSpecified}</option>
                  <option value="dry">{t.dietDry}</option>
                  <option value="wet">{t.dietWet}</option>
                  <option value="mixed">{t.dietMixed}</option>
                  <option value="raw">{t.dietRaw}</option>
                </select>
              </Field>
              <Field label={t.vaccination}>
                <select
                  value={vaccinated == null ? '' : vaccinated ? 'yes' : 'no'}
                  onChange={e => setVaccinated(e.target.value === '' ? null : e.target.value === 'yes')}
                  className={inputCls}
                >
                  <option value="">{dict.common.notSpecified}</option>
                  <option value="yes">{t.vaccinationYes}</option>
                  <option value="no">{t.vaccinationNo}</option>
                </select>
              </Field>
            </div>
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

          <div className="flex gap-3 pt-2">
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="rounded-full border border-status-error-bg px-5 py-3.5 text-sm font-semibold text-status-error-fg transition-colors hover:bg-status-error-bg/40 disabled:opacity-50"
              >
                {deleting ? t.deletingBtn : t.deleteBtn}
              </button>
            )}
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

      {confirmDelete && isEdit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-cat-title"
          className="app-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
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
      )}
    </AppShell>
  )
}

const inputCls =
  'app-input py-2.5'

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
    <label className="block">
      <span className="block text-sm font-semibold text-text mb-1.5">{label}</span>
      {children}
      {error && <span className="app-field-error block">{error}</span>}
    </label>
  )
}
