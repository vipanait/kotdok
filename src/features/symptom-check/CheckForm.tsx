'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { SymptomCheckResult, Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import AppShell from '@/components/AppShell'
import CatAvatar from '@/components/CatAvatar'
import CheckResultContent, { type SymptomCheckRecord } from '@/features/symptom-check/CheckResultContent'

interface Props {
  cats: Pick<Cat, 'id' | 'name' | 'breed' | 'age_years' | 'sex'>[]
  onClose?: () => void
  onFeedbackPrompt?: () => void
}

export default function CheckForm({ cats, onClose, onFeedbackPrompt }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.check
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedCatId, setSelectedCatId] = useState<string>(cats[0]?.id ?? '')
  const [showCatPicker, setShowCatPicker] = useState(false)
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
      setError(t.photoSizeError.replace('{names}', oversized.map(f => f.name).join(', ')))
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const newPreviews = toAdd.map(f => URL.createObjectURL(f))
    setPhotos(prev => [...prev, ...toAdd])
    setPhotoPreviews(prev => [...prev, ...newPreviews])
    if (skipped > 0) {
      setError(t.photoCountError.replace('{max}', String(MAX_PHOTOS)).replace('{skipped}', String(skipped)))
    } else {
      setError('')
    }
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
      else if (res.status === 402) { onClose?.(); router.push('/dashboard') }
      else setError(data.error || t.errorGeneric)
      setLoading(false)
      return
    }

    setResult(data)
    setLoading(false)
    router.refresh()
    if (data.showFeedbackPrompt === true) {
      onFeedbackPrompt?.()
    }
    if (data.showFeedbackPrompt === true) {
      onFeedbackPrompt?.()
    }
  }

  const selectedCat = cats.find(c => c.id === selectedCatId)

  const appetiteOptions = [
    { value: 'normal', label: t.appetiteNormal },
    { value: 'reduced', label: t.appetiteReduced },
    { value: 'none', label: t.appetiteNone },
  ]

  const activityOptions = [
    { value: 'normal', label: t.activityNormal },
    { value: 'low', label: t.activityLow },
    { value: 'lethargic', label: t.activityLethargic },
  ]

  const durationOptions = [
    { value: 'today', label: t.durationToday },
    { value: '2-3days', label: t.duration2_3days },
    { value: 'week+', label: t.durationWeekPlus },
  ]

  const stoolOptions = [
    { value: 'normal', label: t.stoolNormal },
    { value: 'loose', label: t.stoolLoose },
    { value: 'absent', label: t.stoolAbsent },
    { value: 'bloody', label: t.stoolBloody },
  ]

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Selected pet card */}
      {selectedCat && (
        <div className="rounded-2xl bg-card-soft p-3 flex items-center gap-3">
          <CatAvatar size={44} bg="#FFFFFF" />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-text truncate">{selectedCat.name}</div>
            <div className="text-xs text-text-muted truncate">
              {[selectedCat.breed, selectedCat.age_years ? `${selectedCat.age_years} ${dict.dashboard.yearsOld}` : null]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
          {cats.length > 1 && (
            <button
              type="button"
              onClick={() => setShowCatPicker(v => !v)}
              className="rounded-full bg-card border border-hairline px-4 py-1.5 text-xs font-medium text-text hover:bg-canvas-soft transition-colors"
            >
              {dict.check.changeCat}
            </button>
          )}
        </div>
      )}

      {showCatPicker && cats.length > 1 && (
        <div className="rounded-2xl bg-canvas-soft p-2 grid gap-1">
          {cats.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setSelectedCatId(c.id); setShowCatPicker(false) }}
              className={`text-left rounded-xl px-3 py-2 text-sm transition-colors ${
                c.id === selectedCatId ? 'bg-card font-semibold text-text' : 'text-text-muted hover:bg-card/60'
              }`}
            >
              {c.name}
              {c.breed && <span className="text-text-faint ml-2">{c.breed}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
        <ChipGroup label={t.appetite} value={appetite} onChange={setAppetite} options={appetiteOptions} />
        <ChipGroup label={t.activity} value={activity} onChange={setActivity} options={activityOptions} />
        <ChipGroup label={t.duration} value={duration} onChange={setDuration} options={durationOptions} />
        <ChipGroup label={t.stool} value={stool} onChange={setStool} options={stoolOptions} />
      </div>

      <div>
        <p className="text-sm font-semibold text-text mb-2">{dict.check.describeMore}</p>
        <textarea
          value={symptoms}
          onChange={e => setSymptoms(e.target.value)}
          placeholder={t.symptomsPlaceholder}
          rows={4}
          className="w-full bg-card border border-hairline rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
        />
      </div>

      {/* Photo dropzone */}
      <div className="space-y-2">
        {photoPreviews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photoPreviews.map((src, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden border border-hairline aspect-square">
                <Image src={src} alt={`Photo ${i + 1}`} fill className="object-cover" />
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
            className="border-2 border-dashed border-[#E8D5B0] rounded-xl bg-card-soft/40 px-4 py-5 text-center cursor-pointer hover:bg-card-soft transition-colors"
          >
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-text">
              <span aria-hidden>📷</span>
              {photos.length === 0
                ? t.addPhoto
                : t.morePhotos.replace('{count}', String(photos.length)).replace('{max}', String(MAX_PHOTOS))}
            </div>
            <p className="text-xs text-text-muted mt-1">{t.photoHint}</p>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
      </div>

      {error && <div className="bg-status-error-bg text-status-error-fg text-sm rounded-xl px-4 py-3">{error}</div>}

      <div className="pt-1">
        <button
          type="submit"
          disabled={loading || symptoms.trim().length < 3}
          className="w-full rounded-full bg-accent text-white py-4 font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              {photos.length > 0 ? t.analyzingPhotos : t.analyzing}
            </span>
          ) : (
            dict.check.submitButton
          )}
        </button>
        <p className="text-center text-xs text-text-muted mt-2">{dict.check.willCharge}</p>
      </div>
    </form>
  )

  // Build a SymptomCheckRecord-shaped object from the API result so we can
  // reuse the same renderer used by history.
  const resultRecord: SymptomCheckRecord | null = result ? {
    id: 'pending',
    symptoms_input: symptoms,
    urgency: result.urgency,
    urgency_reason: result.urgency_reason,
    possible_causes: result.possible_causes,
    cat_specific_warning: result.cat_specific_warning ?? null,
    home_care_steps: result.home_care_steps,
    vet_questions: result.vet_questions,
    full_response: {
      appetite: result.appetite ?? null,
      activity: result.activity ?? null,
      duration: result.duration ?? null,
      stool: result.stool ?? null,
      photo_observations: result.photo_observations ?? null,
      additional_cat_info_needed: result.additional_cat_info_needed,
      has_photo: result.has_photo,
      disclaimer: result.disclaimer,
    },
    created_at: new Date().toISOString(),
  } : null

  const resultContent = resultRecord ? (
    <div>
      <CheckResultContent check={resultRecord} />
      <div className="px-6 sm:px-8 mt-6 flex gap-3">
        <button
          onClick={() => { setResult(null); setSymptoms(''); removeAllPhotos() }}
          className="flex-1 bg-card border border-hairline text-text py-3 rounded-full font-medium hover:bg-canvas-soft transition-colors text-sm"
        >
          {t.newCheck}
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-accent text-white py-3 font-semibold hover:bg-accent-hover transition-colors text-sm"
          >
            {dict.common.close}
          </button>
        ) : (
          <Link href="/dashboard" className="flex-1 rounded-full bg-accent text-white py-3 font-semibold hover:bg-accent-hover transition-colors text-sm text-center">
            {t.toAccount}
          </Link>
        )}
      </div>
      <p className="text-center text-xs text-text-faint mt-4 px-6 pb-2">
        {t.creditsRemaining.replace('{n}', String(result!.credits_remaining))}
      </p>
    </div>
  ) : null

  if (onClose) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-text/70 hover:text-text w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors text-xl leading-none"
          aria-label={dict.common.close}
        >
          ×
        </button>
        <div className="p-6 sm:p-8">
          {!result ? (
            <>
              <div className="mb-5 pr-10">
                <p className="text-[11px] font-semibold tracking-wider text-text-muted">{dict.check.stepLabel}</p>
                <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-bold text-text">{t.modalHeading}</h2>
              </div>
              {formContent}
            </>
          ) : (
            resultContent
          )}
        </div>
      </div>
    )
  }

  return (
    <AppShell right={
      <Link href="/dashboard" className="text-sm text-text-muted hover:text-text">{dict.common.back}</Link>
    }>
      {!result ? (
        <div className="bg-card rounded-3xl p-6 sm:p-8">
          <p className="text-[11px] font-semibold tracking-wider text-text-muted">{dict.check.stepLabel}</p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold text-text mb-1">{t.pageHeading}</h1>
          <p className="text-sm text-text-muted mb-6">{t.pageSubheading}</p>
          {formContent}
        </div>
      ) : (
        <div className="bg-card rounded-3xl p-6 sm:p-8">{resultContent}</div>
      )}
    </AppShell>
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
      <p className="text-sm font-semibold text-text mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? '' : opt.value)}
            className={`px-3.5 py-1.5 rounded-full text-sm transition-colors ${
              value === opt.value
                ? 'bg-card-soft text-text font-medium'
                : 'bg-card border border-hairline text-text-muted hover:border-card-soft-strong'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
