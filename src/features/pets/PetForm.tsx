'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Pet, PetSizeClass, PetSpecies, PetWalkActivity } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import AppShell from '@/components/AppShell'
import PetAvatar from '@/components/PetAvatar'
import { csrfHeaders } from '@/shared/security/csrf-client'

type PetFormValues = Omit<Pet, 'id' | 'user_id' | 'created_at'>

type SavedKind = 'created' | 'updated' | 'deleted'

interface Props {
  pet?: Pet
  modal?: boolean
  onSaved?: (kind: SavedKind) => void
  onDirtyChange?: (dirty: boolean) => void
  onCancel?: () => void
}

const NOTES_MAX = 300

function toArr(val: string): string[] {
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

function fromArr(arr: string[]): string {
  return arr.join(', ')
}

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

export default function PetForm({ pet, modal = false, onSaved, onDirtyChange, onCancel }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.pets
  const isEdit = !!pet

  const [species, setSpecies] = useState<PetSpecies>(pet?.species ?? 'cat')
  const [name, setName] = useState(pet?.name ?? '')
  const [breed, setBreed] = useState(pet?.breed ?? '')
  const [ageYears, setAgeYears] = useState(pet?.age_years?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(pet?.weight_kg?.toString() ?? '')
  const [sex, setSex] = useState<Pet['sex']>(pet?.sex ?? null)
  const [neutered, setNeutered] = useState<boolean | null>(pet?.neutered ?? null)
  const [indoorOutdoor, setIndoorOutdoor] = useState<Pet['indoor_outdoor']>(pet?.indoor_outdoor ?? null)
  const [diet, setDiet] = useState<Pet['diet']>(pet?.diet ?? null)
  const [sizeClass, setSizeClass] = useState<PetSizeClass | null>(pet?.size_class ?? null)
  const [walkActivity, setWalkActivity] = useState<PetWalkActivity | null>(pet?.walk_activity ?? null)
  const [allergies, setAllergies] = useState(fromArr(pet?.allergies ?? []))
  const [vaccinated, setVaccinated] = useState<boolean | null>(pet?.vaccinated ?? null)
  const [chronicConditions, setChronicConditions] = useState(fromArr(pet?.chronic_conditions ?? []))
  const [medications, setMedications] = useState(fromArr(pet?.medications ?? []))
  const [notes, setNotes] = useState(pet?.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [nameError, setNameError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sexFemale = species === 'dog' ? t.sexFemaleDog : t.sexFemaleCat
  const sexMale = species === 'dog' ? t.sexMaleDog : t.sexMaleCat
  const chronicPlaceholder = species === 'dog' ? t.chronicPlaceholderDog : t.chronicPlaceholderCat
  const medicationsPlaceholder = species === 'dog' ? t.medicationsPlaceholderDog : t.medicationsPlaceholderCat
  const namePlaceholder = species === 'dog' ? t.namePlaceholderDog : t.namePlaceholderCat
  const breedPlaceholder = species === 'dog' ? t.breedPlaceholderDog : t.breedPlaceholderCat

  const dirty =
    species !== (pet?.species ?? 'cat') ||
    name !== (pet?.name ?? '') ||
    breed !== (pet?.breed ?? '') ||
    ageYears !== (pet?.age_years?.toString() ?? '') ||
    weightKg !== (pet?.weight_kg?.toString() ?? '') ||
    sex !== (pet?.sex ?? null) ||
    neutered !== (pet?.neutered ?? null) ||
    indoorOutdoor !== (pet?.indoor_outdoor ?? null) ||
    diet !== (pet?.diet ?? null) ||
    sizeClass !== (pet?.size_class ?? null) ||
    walkActivity !== (pet?.walk_activity ?? null) ||
    allergies !== fromArr(pet?.allergies ?? []) ||
    vaccinated !== (pet?.vaccinated ?? null) ||
    chronicConditions !== fromArr(pet?.chronic_conditions ?? []) ||
    medications !== fromArr(pet?.medications ?? []) ||
    notes !== (pet?.notes ?? '')

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

    const body: PetFormValues = {
      species,
      name: name.trim(),
      breed: breed.trim() || null,
      age_years: parseDecimal(ageYears),
      weight_kg: parseDecimal(weightKg),
      sex,
      neutered,
      indoor_outdoor: indoorOutdoor,
      diet,
      size_class: species === 'dog' ? sizeClass : null,
      walk_activity: species === 'dog' ? walkActivity : null,
      allergies: toArr(allergies),
      vaccinated,
      chronic_conditions: toArr(chronicConditions),
      medications: toArr(medications),
      notes: notes.trim() || null,
    }

    const url = isEdit ? `/api/pets/${pet!.id}` : '/api/pets'
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
      router.push(`/dashboard?petSaved=${kind}`)
      router.refresh()
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/pets/${pet!.id}`, { method: 'DELETE', headers: csrfHeaders() })
    if (onSaved) {
      onSaved('deleted')
      router.refresh()
    } else {
      router.push('/dashboard?petSaved=deleted')
      router.refresh()
    }
  }

  const heading = (
    <div className="flex items-center gap-4 mb-6 sm:mb-8">
      <PetAvatar size={modal ? 56 : 68} species={species} />
      <h1 className={modal
        ? 'text-2xl sm:text-3xl font-extrabold text-text leading-tight pr-8'
        : 'text-3xl sm:text-4xl font-extrabold text-text leading-tight'}>
        {isEdit ? pet!.name : t.newTitle}
      </h1>
    </div>
  )

  const cancelControl = onCancel ? (
    <button type="button" onClick={onCancel} className="app-button-secondary flex-1 py-3.5">
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
          <Field label={t.species}>
            <select
              value={species}
              onChange={e => {
                const value = e.target.value as PetSpecies
                setSpecies(value)
                if (value !== 'dog') {
                  setSizeClass(null)
                  setWalkActivity(null)
                }
              }}
              className={inputCls}
            >
              <option value="cat">{t.speciesCat}</option>
              <option value="dog">{t.speciesDog}</option>
            </select>
          </Field>

          <Field label={t.name} error={nameError}>
            <input
              value={name}
              onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
              placeholder={namePlaceholder}
              className={inputCls}
              aria-invalid={!!nameError}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t.breed}>
              <input value={breed} onChange={e => setBreed(e.target.value)} placeholder={breedPlaceholder} className={inputCls} />
            </Field>
            <Field label={t.ageYears}>
              <input type="text" inputMode="decimal" value={ageYears} onChange={e => setAgeYears(sanitizeDecimalInput(e.target.value))} placeholder="3" className={inputCls} />
            </Field>
            <Field label={t.weightKg}>
              <input type="text" inputMode="decimal" value={weightKg} onChange={e => setWeightKg(sanitizeDecimalInput(e.target.value))} placeholder="4.5" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t.sex}>
              <select value={sex ?? ''} onChange={e => setSex((e.target.value || null) as Pet['sex'])} className={selectCls(!sex)}>
                <option value="">{dict.common.notSpecifiedM}</option>
                <option value="female">{sexFemale}</option>
                <option value="male">{sexMale}</option>
              </select>
            </Field>
            <Field label={t.neutered}>
              <select value={neutered == null ? '' : neutered ? 'yes' : 'no'} onChange={e => setNeutered(e.target.value === '' ? null : e.target.value === 'yes')} className={selectCls(neutered == null)}>
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
              <select value={indoorOutdoor ?? ''} onChange={e => setIndoorOutdoor((e.target.value || null) as Pet['indoor_outdoor'])} className={selectCls(!indoorOutdoor)}>
                <option value="">{dict.common.notSpecifiedM}</option>
                <option value="indoor">{t.lifestyleIndoor}</option>
                <option value="outdoor">{t.lifestyleOutdoor}</option>
                <option value="both">{t.lifestyleBoth}</option>
              </select>
            </Field>
            <Field label={t.diet}>
              <select value={diet ?? ''} onChange={e => setDiet((e.target.value || null) as Pet['diet'])} className={selectCls(!diet)}>
                <option value="">{dict.common.notSpecified}</option>
                <option value="dry">{t.dietDry}</option>
                <option value="wet">{t.dietWet}</option>
                <option value="mixed">{t.dietMixed}</option>
                <option value="raw">{t.dietRaw}</option>
              </select>
            </Field>
            <Field label={t.vaccination}>
              <select value={vaccinated == null ? '' : vaccinated ? 'yes' : 'no'} onChange={e => setVaccinated(e.target.value === '' ? null : e.target.value === 'yes')} className={selectCls(vaccinated == null)}>
                <option value="">{dict.common.notSpecified}</option>
                <option value="yes">{t.vaccinationYes}</option>
                <option value="no">{t.vaccinationNo}</option>
              </select>
            </Field>
          </div>
        </FormSection>

        {species === 'dog' && (
          <FormSection title={t.sectionDog}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t.sizeClass}>
                <select
                  value={sizeClass ?? ''}
                  onChange={e => setSizeClass((e.target.value || null) as PetSizeClass | null)}
                  className={selectCls(!sizeClass)}
                >
                  <option value="">{dict.common.notSpecifiedM}</option>
                  <option value="toy">{t.sizeToy}</option>
                  <option value="small">{t.sizeSmall}</option>
                  <option value="medium">{t.sizeMedium}</option>
                  <option value="large">{t.sizeLarge}</option>
                  <option value="giant">{t.sizeGiant}</option>
                </select>
              </Field>
              <Field label={t.walkActivity}>
                <select
                  value={walkActivity ?? ''}
                  onChange={e => setWalkActivity((e.target.value || null) as PetWalkActivity | null)}
                  className={selectCls(!walkActivity)}
                >
                  <option value="">{dict.common.notSpecifiedM}</option>
                  <option value="rare">{t.walkRare}</option>
                  <option value="daily_short">{t.walkDailyShort}</option>
                  <option value="daily_long">{t.walkDailyLong}</option>
                  <option value="sport">{t.walkSport}</option>
                </select>
              </Field>
            </div>
          </FormSection>
        )}

        <FormSection title={t.sectionHealth}>
          <div className="grid gap-5">
            <Field label={t.allergies}>
              <input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder={t.allergiesPlaceholder} className={inputCls} />
            </Field>
            <Field label={t.chronicConditions}>
              <input value={chronicConditions} onChange={e => setChronicConditions(e.target.value)} placeholder={chronicPlaceholder} className={inputCls} />
            </Field>
            <Field label={t.medications}>
              <input value={medications} onChange={e => setMedications(e.target.value)} placeholder={medicationsPlaceholder} className={inputCls} />
            </Field>
          </div>
        </FormSection>

        <FormSection title={t.sectionNotes}>
          <Field label={t.notes}>
            <textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))} placeholder={t.notesPlaceholder} rows={3} className="app-input resize-none" />
            <p className={`text-xs mt-1 text-right ${notes.length >= NOTES_MAX ? 'text-status-error-fg' : 'text-text-faint'}`}>
              {notes.length}/{NOTES_MAX}
            </p>
          </Field>
        </FormSection>

        {formError && <div className="bg-status-error-bg text-status-error-fg text-sm rounded-xl px-4 py-3">{formError}</div>}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
          {isEdit && (
            <button type="button" onClick={() => setConfirmDelete(true)} disabled={deleting} className="rounded-full border border-status-error-bg px-5 py-3.5 text-sm font-semibold text-status-error-fg transition-colors hover:bg-status-error-bg/40 disabled:opacity-50 sm:mr-auto">
              {deleting ? t.deletingBtn : t.deleteBtn}
            </button>
          )}
          {cancelControl}
          <button type="submit" disabled={saving} className="app-button-primary flex-1 py-3.5">
            {saving ? t.savingBtn : isEdit ? t.saveBtn : t.addBtn}
          </button>
        </div>
      </form>
    </div>
  )

  const deleteDialog = confirmDelete && isEdit && (
    <div role="dialog" aria-modal="true" aria-labelledby="delete-pet-title" className="app-overlay fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" onClick={e => { if (e.target === e.currentTarget && !deleting) setConfirmDelete(false) }}>
      <div className="app-card w-full rounded-b-none p-6 sm:max-w-sm sm:rounded-b-3xl">
        <h2 id="delete-pet-title" className="text-lg font-bold text-text mb-2">
          {t.confirmDeleteTitle.replace('{name}', pet!.name)}
        </h2>
        <p className="text-sm text-text-muted mb-5">{t.confirmDeleteBody}</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} className="app-button-secondary flex-1 py-3 text-sm">{t.cancelBtn}</button>
          <button type="button" onClick={handleDelete} disabled={deleting} className="app-button-danger flex-1 py-3 text-sm">{deleting ? t.deletingBtn : t.deleteBtn}</button>
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
    <AppShell width="wide" right={<Link href="/dashboard" className="app-link">{dict.common.back}</Link>}>
      {heading}
      {formBody}
      {deleteDialog}
    </AppShell>
  )
}

const inputCls = 'app-input py-2.5'

function selectCls(empty: boolean) {
  return empty ? `${inputCls} app-input-empty` : inputCls
}

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
