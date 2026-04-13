'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { SymptomCheckResult, Cat } from '@/types'
import { URGENCY_CONFIG } from '@/lib/urgency'

interface Props {
  cats: Pick<Cat, 'id' | 'name' | 'breed' | 'age_years' | 'sex'>[]
}

export default function CheckForm({ cats }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedCatId, setSelectedCatId] = useState<string>('')
  const [symptoms, setSymptoms] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<(SymptomCheckResult & { credits_remaining: number }) | null>(null)
  const [error, setError] = useState('')

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Фото должно быть до 10 МБ')
      return
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError('')
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    let res: Response

    if (photo) {
      const formData = new FormData()
      formData.append('symptoms', symptoms)
      formData.append('photo', photo)
      if (selectedCatId) formData.append('cat_id', selectedCatId)
      res = await fetch('/api/symptom-check', { method: 'POST', body: formData })
    } else {
      res = await fetch('/api/symptom-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, cat_id: selectedCatId || undefined }),
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

            <textarea
              value={symptoms}
              onChange={e => setSymptoms(e.target.value)}
              placeholder="Например: кошка не ест второй день, прячется под диваном, иногда пьёт воду. Ей 5 лет, стерилизована. Рвоты нет, в туалет ходит..."
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />

            {!photoPreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-5 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-colors"
              >
                <div className="text-2xl mb-1">📷</div>
                <div className="text-sm font-medium text-gray-600">Добавить фото (необязательно)</div>
                <div className="text-xs text-gray-400 mt-1">Рана, глаз, кожа, поза — до 10 МБ</div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-gray-200">
                <Image src={photoPreview} alt="Фото кошки" width={600} height={300} className="w-full object-cover max-h-64" />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 bg-black/60 text-white text-xs px-3 py-1 rounded-full hover:bg-black/80"
                >
                  Убрать
                </button>
                <div className="absolute bottom-2 left-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
                  📷 Фото добавлено
                </div>
              </div>
            )}

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
                  {photo ? 'Анализируем фото (~20 сек)...' : 'Анализируем (~15 сек)...'}
                </span>
              ) : (
                photo ? 'Анализировать фото + симптомы' : 'Проверить симптомы'
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
              onClick={() => { setResult(null); setSymptoms(''); removePhoto() }}
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
