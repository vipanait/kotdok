'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Cat } from '@/types'
import { useTranslations } from '@/components/LocaleProvider'
import AppShell from '@/components/AppShell'

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

    router.push('/dashboard')
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/cats/${cat!.id}`, { method: 'DELETE' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <AppShell right={
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">{dict.common.back}</Link>
    }>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">
          {isEdit ? `${t.editTitlePrefix}: ${cat!.name}` : t.newTitle}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.name}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.breed}</label>
              <input
                value={breed}
                onChange={e => setBreed(e.target.value)}
                placeholder={t.breedPlaceholder}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.ageYears}</label>
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                value={ageYears}
                onChange={e => setAgeYears(e.target.value)}
                placeholder="3"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.weightKg}</label>
              <input
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                placeholder="4.5"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.sex}</label>
              <select
                value={sex ?? ''}
                onChange={e => setSex((e.target.value || null) as Cat['sex'])}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">{dict.common.notSpecifiedM}</option>
                <option value="female">{t.sexFemale}</option>
                <option value="male">{t.sexMale}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.neutered}</label>
              <select
                value={neutered == null ? '' : neutered ? 'yes' : 'no'}
                onChange={e => setNeutered(e.target.value === '' ? null : e.target.value === 'yes')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">{dict.common.notSpecified}</option>
                <option value="yes">{dict.common.yes}</option>
                <option value="no">{dict.common.no}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.lifestyle}</label>
              <select
                value={indoorOutdoor ?? ''}
                onChange={e => setIndoorOutdoor((e.target.value || null) as Cat['indoor_outdoor'])}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">{dict.common.notSpecifiedM}</option>
                <option value="indoor">{t.lifestyleIndoor}</option>
                <option value="outdoor">{t.lifestyleOutdoor}</option>
                <option value="both">{t.lifestyleBoth}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.diet}</label>
              <select
                value={diet ?? ''}
                onChange={e => setDiet((e.target.value || null) as Cat['diet'])}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">{dict.common.notSpecified}</option>
                <option value="dry">{t.dietDry}</option>
                <option value="wet">{t.dietWet}</option>
                <option value="mixed">{t.dietMixed}</option>
                <option value="raw">{t.dietRaw}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.vaccination}</label>
              <select
                value={vaccinated == null ? '' : vaccinated ? 'yes' : 'no'}
                onChange={e => setVaccinated(e.target.value === '' ? null : e.target.value === 'yes')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">{dict.common.notSpecified}</option>
                <option value="yes">{t.vaccinationYes}</option>
                <option value="no">{t.vaccinationNo}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.allergies}</label>
            <input
              value={allergies}
              onChange={e => setAllergies(e.target.value)}
              placeholder={t.allergiesPlaceholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.chronicConditions}</label>
            <input
              value={chronicConditions}
              onChange={e => setChronicConditions(e.target.value)}
              placeholder={t.chronicPlaceholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.medications}</label>
            <input
              value={medications}
              onChange={e => setMedications(e.target.value)}
              placeholder={t.medicationsPlaceholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.notes}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))}
              placeholder={t.notesPlaceholder}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
            <p className={`text-xs mt-1 text-right ${notes.length >= NOTES_MAX ? 'text-red-400' : 'text-gray-400'}`}>
              {notes.length}/{NOTES_MAX}
            </p>
          </div>

          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

          <div className="flex gap-3 pt-2">
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="px-4 py-3 rounded-xl text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? t.deletingBtn : t.deleteBtn}
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {saving ? t.savingBtn : isEdit ? t.saveBtn : t.addBtn}
            </button>
          </div>
        </form>
      </div>

      {confirmDelete && isEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget && !deleting) setConfirmDelete(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {t.confirmDeleteTitle.replace('{name}', cat!.name)}
            </h2>
            <p className="text-sm text-gray-600 mb-5">
              {t.confirmDeleteBody}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-medium hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
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
