'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SymptomCheckResult, Pet } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import AppShell from '@/components/AppShell'
import PetAvatar from '@/components/PetAvatar'
import CheckResultContent from '@/features/symptom-check/CheckResultContent'
import type { SymptomCheckView } from '@lapka/contracts'
import { csrfHeaders } from '@/shared/security/csrf-client'

interface Props {
  pets: Pick<Pet, 'id' | 'name' | 'breed' | 'age_years' | 'sex' | 'species'>[]
  onClose?: () => void
}

export default function CheckForm({ pets, onClose }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.check

  const [selectedPetId, setSelectedPetId] = useState<string>(pets[0]?.id ?? '')
  const [showPetPicker, setShowPetPicker] = useState(false)
  const [appetite, setAppetite] = useState<string>('')
  const [activity, setActivity] = useState<string>('')
  const [duration, setDuration] = useState<string>('')
  const [stool, setStool] = useState<string>('')
  const [painSigns, setPainSigns] = useState<string[]>([])
  const [symptoms, setSymptoms] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<(SymptomCheckResult & { credits_remaining: number }) | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    const res = await fetch('/api/symptom-check', {
      method: 'POST',
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        symptoms,
        pet_id: selectedPetId || undefined,
        appetite: appetite || undefined,
        activity: activity || undefined,
        duration: duration || undefined,
        stool: stool || undefined,
        pain_signs: painSigns.length ? painSigns : undefined,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      if (res.status === 401) router.push('/login')
      else if (res.status === 402) setError(t.errorNoCredits)
      else setError(data.error || t.errorGeneric)
      setLoading(false)
      return
    }

    setResult(data)
    setLoading(false)
    router.refresh()
  }

  const selectedPet = pets.find(c => c.id === selectedPetId)
  const symptomsTooShort = symptoms.trim().length < 3

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

  const painSignOptions = [
    { value: 'tense', label: t.painTense },
    { value: 'hunched', label: t.painHunched },
    { value: 'grimace', label: t.painGrimace },
    { value: 'touch_sensitive', label: t.painTouchSensitive },
    { value: 'hiding', label: t.painHiding },
    { value: 'vocalizing', label: t.painVocalizing },
  ]

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Selected pet card */}
      {selectedPet && (
        <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-card px-4 py-3">
          <PetAvatar size={40} bg="#FFF8ED" species={selectedPet.species ?? 'cat'} />
          <div className="min-w-0 flex-1 text-base font-semibold text-text truncate">
            {selectedPet.name}
          </div>
          {pets.length > 1 && (
            <button
              type="button"
              onClick={() => setShowPetPicker(v => !v)}
              className="app-button-secondary px-4 py-1.5 text-xs"
            >
              {dict.check.changePet}
            </button>
          )}
        </div>
      )}

      {showPetPicker && pets.length > 1 && (
        <div className="rounded-2xl border border-hairline bg-card p-2 grid gap-1">
          {pets.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setSelectedPetId(c.id); setShowPetPicker(false) }}
              className={`text-left rounded-xl px-3 py-2 text-sm transition-colors ${
                c.id === selectedPetId ? 'bg-canvas-soft font-semibold text-text' : 'text-text-muted hover:bg-canvas-soft/60'
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

      <MultiChipGroup
        label={t.painSigns}
        values={painSigns}
        onChange={setPainSigns}
        options={painSignOptions}
      />

      <div>
        <p className="text-sm font-semibold text-text mb-2">{dict.check.describeMore}</p>
        <textarea
          value={symptoms}
          onChange={e => setSymptoms(e.target.value)}
          placeholder={t.symptomsPlaceholder}
          rows={4}
          className="app-input resize-none"
          aria-describedby="symptoms-hint"
        />
      </div>

      {error && <div className="bg-status-error-bg text-status-error-fg text-sm rounded-xl px-4 py-3">{error}</div>}

      <div className="pt-1">
        <button
          type="submit"
          disabled={loading || symptomsTooShort}
          className="app-button-primary w-full py-4"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              {t.analyzing}
            </span>
          ) : (
            dict.check.submitButton
          )}
        </button>
        <p id="symptoms-hint" className="mt-2 text-center text-xs text-text-muted">
          {symptomsTooShort ? t.symptomsRequired : dict.check.willCharge}
        </p>
      </div>
    </form>
  )

  // Build a renderable view from the API result so we can reuse the same
  // renderer history uses. The check is already saved, but this screen does not
  // need its id.
  const resultRecord: SymptomCheckView | null = result ? {
    id: null,
    symptoms_input: symptoms,
    urgency: result.urgency,
    urgency_reason: result.urgency_reason,
    possible_causes: result.possible_causes,
    species_specific_warning: result.species_specific_warning ?? null,
    home_care_steps: result.home_care_steps,
    vet_questions: result.vet_questions,
    full_response: {
      appetite: result.appetite ?? null,
      activity: result.activity ?? null,
      duration: result.duration ?? null,
      stool: result.stool ?? null,
      pain_signs: result.pain_signs ?? [],
      photo_observations: result.photo_observations ?? null,
      additional_pet_info_needed: result.additional_pet_info_needed,
      has_photo: result.has_photo,
      disclaimer: result.disclaimer,
    },
    created_at: new Date().toISOString(),
    pet_id: null,
    pet_name: null,
    pet_species: null,
  } : null

  const resultContent = resultRecord ? (
    <div>
      <CheckResultContent check={resultRecord} />
      <div className="px-6 sm:px-8 mt-5 space-y-3 pb-1">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="app-button-primary w-full py-3.5 text-sm sm:text-base"
          >
            {dict.common.close}
          </button>
        ) : (
          <Link href="/dashboard" className="app-button-primary w-full py-3.5 text-center text-sm sm:text-base">
            {t.toAccount}
          </Link>
        )}
        <button
          type="button"
          onClick={() => { setResult(null); setSymptoms('') }}
          className="block w-full cursor-pointer text-center text-sm font-semibold text-accent-text transition-colors hover:text-accent"
        >
          {t.newCheckWithCredits.replace('{n}', String(result!.credits_remaining))}
        </button>
      </div>
    </div>
  ) : null

  if (onClose) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          className="app-icon-button absolute top-3 right-3 z-10 bg-card text-xl leading-none shadow-sm ring-1 ring-hairline/80"
          aria-label={dict.common.close}
        >
          ×
        </button>
        <div className="p-6 sm:p-8">
          {!result ? (
            <>
              <div className="mb-5 pr-10">
                <h2 className="font-extrabold text-2xl sm:text-3xl text-text">{t.modalHeading}</h2>
                <p className="text-sm text-text-muted mt-1">{t.modalSubheading}</p>
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
      <Link href="/dashboard" className="app-link">{dict.common.back}</Link>
    }>
      {!result ? (
        <div className="app-card p-6 sm:p-8">
          <h1 className="font-extrabold text-2xl sm:text-3xl text-text mb-1">{t.pageHeading}</h1>
          <p className="text-sm text-text-muted mb-6">{t.pageSubheading}</p>
          {formContent}
        </div>
      ) : (
        <div className="app-card p-6 sm:p-8">{resultContent}</div>
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
                ? 'bg-accent text-white font-semibold shadow-sm'
                : 'bg-card border border-hairline text-text hover:border-card-soft-strong'
            }`}
            aria-pressed={value === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MultiChipGroup({
  label,
  values,
  onChange,
  options,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  options: { value: string; label: string }[]
}) {
  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter(v => v !== value)
        : [...values, value],
    )
  }

  return (
    <div>
      <p className="text-sm font-semibold text-text mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const active = values.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(opt.value)}
              className={`px-3.5 py-1.5 rounded-full text-sm transition-colors ${
                active
                  ? 'bg-accent text-white font-semibold shadow-sm'
                  : 'bg-card border border-hairline text-text hover:border-card-soft-strong'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
