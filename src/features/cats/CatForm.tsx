'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import AppShell from '@/components/AppShell'
import CatAvatar from '@/components/CatAvatar'

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
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError(t.errorName); return }
    setSaving(true)
    setError('')

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || t.errorGeneric)
      setSaving(false)
      return
    }

    router.push(`/dashboard?catSaved=${isEdit ? 'updated' : 'created'}`)
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/cats/${cat!.id}`, { method: 'DELETE' })
    router.push('/dashboard?catSaved=deleted')
    router.refresh()
  }

  return (
    <AppShell width="wide" right={
      <Link href="/dashboard" className="text-text-muted hover:text-text">{dict.common.back}</Link>
    }>
      <div className="flex items-end gap-5 mb-6 sm:mb-8">
        <CatAvatar size={72} />
        <div>
          <p className="text-xs font-semibold tracking-wider text-text-muted uppercase">{t.kicker}</p>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-text leading-none mt-1">
            {isEdit ? `${t.editTitlePrefix}: ${cat!.name}` : t.newTitle}
          </h1>
          <p className="text-xs text-text-muted mt-2">{t.profileSubheading}</p>
        </div>
      </div>

      <div className="bg-card rounded-3xl p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label={t.name}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className={inputCls}
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

          <Field label={t.notes}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))}
              placeholder={t.notesPlaceholder}
              rows={3}
              className="w-full bg-card border border-hairline rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-text-faint resize-none"
            />
            <p className={`text-xs mt-1 text-right ${notes.length >= NOTES_MAX ? 'text-status-error-fg' : 'text-text-faint'}`}>
              {notes.length}/{NOTES_MAX}
            </p>
          </Field>

          {error && <div className="bg-status-error-bg text-status-error-fg text-sm rounded-xl px-4 py-3">{error}</div>}

          <div className="flex gap-3 pt-2">
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="px-5 py-3.5 rounded-full text-sm font-medium text-status-error-fg border border-status-error-bg hover:bg-status-error-bg/40 transition-colors disabled:opacity-50"
              >
                {deleting ? t.deletingBtn : t.deleteBtn}
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-text text-white py-3.5 rounded-full font-semibold hover:bg-black transition-colors disabled:opacity-50"
            >
              {saving ? t.savingBtn : isEdit ? t.saveBtn : t.addBtn}
            </button>
          </div>
        </form>
      </div>

      {confirmDelete && isEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget && !deleting) setConfirmDelete(false) }}
        >
          <div className="bg-card rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6">
            <h2 className="text-lg font-bold text-text mb-2">
              {t.confirmDeleteTitle.replace('{name}', cat!.name)}
            </h2>
            <p className="text-sm text-text-muted mb-5">{t.confirmDeleteBody}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 bg-card border border-hairline text-text py-3 rounded-full font-medium hover:bg-canvas-soft transition-colors text-sm disabled:opacity-50"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-status-error-fg text-white py-3 rounded-full font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-50"
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
  'w-full bg-card border border-hairline rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-text-faint'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-text mb-1.5">{label}</span>
      {children}
    </label>
  )
}
