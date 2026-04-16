'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { SymptomCheckResult, Cat } from '@/types'
import { URGENCY_CONFIG } from '@/lib/urgency'
import { APPETITE_LABELS, ACTIVITY_LABELS, DURATION_LABELS, STOOL_LABELS } from '@/lib/check-params'

interface Props {
  cats: Pick<Cat, 'id' | 'name' | 'breed' | 'age_years' | 'sex'>[]
}

export default function CheckForm({ cats }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedCatId, setSelectedCatId] = useState<string>('')
  const [appetite, setAppetite] = useState<string>('')
  const [activity, setActivity] = useState<string>('')
  const [duration, setDuration] = useState<string>('')
  const [stool, setStool] = useState<string>('')
  const [symptoms, setSymptoms] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<(SymptomCheckResult & { credits_remaining: number }) | null>(null)
  const [error, setError] = useState('')

  const MAX_PHOTOS = 5
  const MAX_PHOTO_SIZE = 5 * 1024 * 1024

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const remaining = MAX_PHOTOS - photos.length
    const toAdd = files.slice(0, remaining)
    const skipped = files.length - toAdd.length

    const oversized = toAdd.filter(f => f.size > MAX_PHOTO_SIZE)
    if (oversized.length) {
      setError(`Каждое фото — до 5 МБ. Превышают лимит: ${oversized.map(f => f.name).join(', ')}`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const newPreviews = toAdd.map(f => URL.createObjectURL(f))
    setPhotos(prev => [...prev, ...toAdd])
    setPhotoPreviews(prev => [...prev, ...newPreviews])
    if (skipped > 0) setError(`Можно добавить не более ${MAX_PHOTOS} фото. ${skipped} фото пропущено.`)
    else setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photoPreviews[index])
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index))
  }

  function removeAllPhotos() {
    photoPreviews.forEach(p => URL.revokeObjectURL(p))
    setPhotos([])
    setPhotoPreviews([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    let res: Response

    const extra = { appetite: appetite || undefined, activity: activity || undefined, duration: duration || undefined, stool: stool || undefined }

    if (photos.length > 0) {
      const formData = new FormData()
      formData.append('symptoms', symptoms)
      photos.forEach(p => formData.append('photo', p))
      if (selectedCatId) formData.append('cat_id', selectedCatId)
      if (appetite) formData.append('appetite', appetite)
      if (activity) formData.append('activity', activity)
      if (duration) formData.append('duration', duration)
      if (stool) formData.append('stool', stool)
      res = await fetch('/api/symptom-check', { method: 'POST', body: formData })
    } else {
      res = await fetch('/api/symptom-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, cat_id: selectedCatId || undefined, ...extra }),
      })
    }

    const data = await res.json()

    if (!res.ok) {
      if (res.status === 401) router.push('/login')
      else if (res.status === 402) router.push('/dashboard?upgrade=1')
      else setError(data.error || 'Произошла ошибка. Попробуйте ещё раз.')
      setLoading(false)
      return
    }

    setResult(data)
    setLoading(false)
  }

  const urgency = result ? URGENCY_CONFIG[result.urgency] : null
  const selectedCat = cats.find(c => c.id === selectedCatId)

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-2xl font-bold">🐱 КотДок</Link>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Назад</Link>
      </div>

      {!result ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Опишите симптомы</h1>
          <p className="text-sm text-gray-500 mb-6">
            Чем подробнее — тем точнее. Укажите как давно, как часто, как ведёт себя кошка. Можно добавить фото.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Выбор кота */}
            {cats.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Чей кот?</label>
                <select
                  value={selectedCatId}
                  onChange={e => setSelectedCatId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                >
                  <option value="">Без профиля</option>
                  {cats.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}{cat.breed ? ` (${cat.breed})` : ''}{cat.age_years ? `, ${cat.age_years} лет` : ''}
                    </option>
                  ))}
                </select>
                {selectedCat && (
                  <p className="text-xs text-gray-400 mt-1">
                    Профиль {selectedCat.name} будет учтён при анализе
                  </p>
                )}
              </div>
            )}

            {/* Быстрые вопросы */}
            <div className="space-y-3">
              <ChipGroup
                label="Аппетит"
                value={appetite}
                onChange={setAppetite}
                options={[
                  { value: 'normal', label: 'Ест нормально' },
                  { value: 'reduced', label: 'Ест меньше' },
                  { value: 'none', label: 'Не ест' },
                ]}
              />
              <ChipGroup
                label="Активность"
                value={activity}
                onChange={setActivity}
                options={[
                  { value: 'normal', label: 'Бодрый' },
                  { value: 'low', label: 'Менее активный' },
                  { value: 'lethargic', label: 'Вялый' },
                ]}
              />
              <ChipGroup
                label="Симптомы длятся"
                value={duration}
                onChange={setDuration}
                options={[
                  { value: 'today', label: 'Сегодня' },
                  { value: '2-3days', label: '2–3 дня' },
                  { value: 'week+', label: 'Больше недели' },
                ]}
              />
              <ChipGroup
                label="Стул"
                value={stool}
                onChange={setStool}
                options={[
                  { value: 'normal', label: 'Нормальный' },
                  { value: 'loose', label: 'Жидкий (понос)' },
                  { value: 'absent', label: 'Отсутствует' },
                  { value: 'bloody', label: 'С кровью' },
                ]}
              />
            </div>

            <textarea
              value={symptoms}
              onChange={e => setSymptoms(e.target.value)}
              placeholder="Опишите подробнее: что именно происходит, когда началось, как ведёт себя кошка..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />

            <div className="space-y-2">
              {photoPreviews.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photoPreviews.map((src, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden border border-gray-200 aspect-square">
                      <Image src={src} alt={`Фото ${i + 1}`} fill className="object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/80 leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < MAX_PHOTOS && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-5 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-colors"
                >
                  <div className="text-2xl mb-1">📷</div>
                  <div className="text-sm font-medium text-gray-600">
                    {photos.length === 0 ? 'Добавить фото (необязательно)' : `Ещё фото (${photos.length}/${MAX_PHOTOS})`}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Рана, глаз, кожа, поза — до 5 МБ каждое</div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
            </div>

            {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

            <button
              type="submit"
              disabled={loading || symptoms.trim().length < 3}
              className="w-full bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  {photos.length > 0 ? 'Анализируем фото (~20 сек)...' : 'Анализируем (~15 сек)...'}
                </span>
              ) : (
                photos.length > 0 ? `Анализировать фото (${photos.length}) + симптомы` : 'Проверить симптомы'
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`rounded-2xl border-2 p-6 ${urgency!.color}`}>
            <div className="text-4xl mb-2">{urgency!.emoji}</div>
            <div className="text-2xl font-bold mb-1">{urgency!.label}</div>
            <div className="text-lg font-medium mb-2">{urgency!.action}</div>
            <div className="text-sm opacity-75">{result.urgency_reason}</div>
          </div>

          {(result.appetite || result.activity || result.duration || result.stool) && (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Указано при проверке</p>
              <div className="flex flex-wrap gap-2">
                {result.appetite && <Chip label={`Аппетит: ${APPETITE_LABELS[result.appetite] ?? result.appetite}`} />}
                {result.activity && <Chip label={`Активность: ${ACTIVITY_LABELS[result.activity] ?? result.activity}`} />}
                {result.duration && <Chip label={`Длительность: ${DURATION_LABELS[result.duration] ?? result.duration}`} />}
                {result.stool && <Chip label={`Стул: ${STOOL_LABELS[result.stool] ?? result.stool}`} />}
              </div>
            </div>
          )}

          {result.has_photo && result.photo_observations && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h2 className="font-semibold text-blue-900 mb-2">📷 Что видно на фото</h2>
              <p className="text-sm text-blue-800">{result.photo_observations}</p>
            </div>
          )}

          {result.possible_causes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-3">Возможные причины</h2>
              <ul className="space-y-2">
                {result.possible_causes.map((cause, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                    {cause}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.cat_specific_warning && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
              <h2 className="font-semibold text-amber-900 mb-2">⚠️ Важно для кошек</h2>
              <p className="text-sm text-amber-800">{result.cat_specific_warning}</p>
            </div>
          )}

          {result.home_care_steps.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-3">Что делать дома</h2>
              <ol className="space-y-2">
                {result.home_care_steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-700">
                    <span className="text-orange-500 font-medium shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {result.vet_questions.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-3">📋 Вопросы для ветеринара</h2>
              <ul className="space-y-2">
                {result.vet_questions.map((q, i) => (
                  <li key={i} className="text-sm text-gray-700 border-b border-gray-50 pb-2 last:border-0 last:pb-0">{q}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 text-center">
            {result.disclaimer}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setResult(null); setSymptoms(''); removeAllPhotos() }}
              className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
            >
              Новая проверка
            </button>
            <Link href="/dashboard" className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors text-sm text-center">
              В личный кабинет
            </Link>
          </div>

          <p className="text-center text-xs text-gray-400">Осталось credits: {result.credits_remaining}</p>
        </div>
      )}
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 rounded-full text-xs bg-white border border-gray-200 text-gray-600">
      {label}
    </span>
  )
}

function ChipGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? '' : opt.value)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              value === opt.value
                ? 'bg-orange-50 border-orange-400 text-orange-700 font-medium'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
