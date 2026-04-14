'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Cat } from '@/types'

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Введите имя кота'); return }
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
      setError(data.error || 'Произошла ошибка')
      setSaving(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm('Удалить профиль кота?')) return
    setDeleting(true)
    await fetch(`/api/cats/${cat!.id}`, { method: 'DELETE' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-2xl font-bold">🐱 КотДок</Link>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Назад</Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">
          {isEdit ? `Редактировать: ${cat!.name}` : 'Добавить кота'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Имя */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Имя *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Мурка"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Порода + Возраст + Вес */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Порода</label>
              <input
                value={breed}
                onChange={e => setBreed(e.target.value)}
                placeholder="Сибирская"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Возраст (лет)</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Вес (кг)</label>
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

          {/* Пол + Стерилизация */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пол</label>
              <select
                value={sex ?? ''}
                onChange={e => setSex((e.target.value || null) as Cat['sex'])}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">Не указан</option>
                <option value="female">Кошка</option>
                <option value="male">Кот</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Стерилизована/кастрирован</label>
              <select
                value={neutered == null ? '' : neutered ? 'yes' : 'no'}
                onChange={e => setNeutered(e.target.value === '' ? null : e.target.value === 'yes')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">Не указано</option>
                <option value="yes">Да</option>
                <option value="no">Нет</option>
              </select>
            </div>
          </div>

          {/* Образ жизни + Питание + Вакцинация */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Образ жизни</label>
              <select
                value={indoorOutdoor ?? ''}
                onChange={e => setIndoorOutdoor((e.target.value || null) as Cat['indoor_outdoor'])}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">Не указан</option>
                <option value="indoor">Домашний</option>
                <option value="outdoor">Уличный</option>
                <option value="both">Смешанный</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Питание</label>
              <select
                value={diet ?? ''}
                onChange={e => setDiet((e.target.value || null) as Cat['diet'])}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">Не указано</option>
                <option value="dry">Сухой корм</option>
                <option value="wet">Влажный</option>
                <option value="mixed">Смешанное</option>
                <option value="raw">Натуральное</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Вакцинация</label>
              <select
                value={vaccinated == null ? '' : vaccinated ? 'yes' : 'no'}
                onChange={e => setVaccinated(e.target.value === '' ? null : e.target.value === 'yes')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                <option value="">Не указано</option>
                <option value="yes">Привита</option>
                <option value="no">Нет</option>
              </select>
            </div>
          </div>

          {/* Аллергии */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Аллергии</label>
            <input
              value={allergies}
              onChange={e => setAllergies(e.target.value)}
              placeholder="курица, рыба — через запятую"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Хронические болезни */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Хронические болезни</label>
            <input
              value={chronicConditions}
              onChange={e => setChronicConditions(e.target.value)}
              placeholder="ХБП, сахарный диабет — через запятую"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Препараты */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Принимает препараты</label>
            <input
              value={medications}
              onChange={e => setMedications(e.target.value)}
              placeholder="Нефростоп, витамины — через запятую"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Доп. информация */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Дополнительно</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))}
              placeholder="Любые детали, которые помогут при анализе симптомов..."
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
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-3 rounded-xl text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Удаление...' : 'Удалить'}
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Сохраняем...' : isEdit ? 'Сохранить' : 'Добавить кота'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
