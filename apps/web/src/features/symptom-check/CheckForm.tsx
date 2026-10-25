'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SYMPTOMS_MAX, SYMPTOMS_MIN, type SymptomCheckView } from '@lapka/contracts'
import { localToday } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import Illustration from '@/components/ui/Illustration'
import CheckResultContent from '@/features/symptom-check/CheckResultContent'
import { checkOptions, type CheckOption } from '@/features/symptom-check/check-options'
import { csrfHeaders } from '@/shared/security/csrf-client'
import type { CheckPet, SymptomCheckResult } from '@/shared/types'
import { petHealthFacts, petSummary } from '@/shared/utils/pet-summary'

interface Props {
  /** At least one: the page shows its own empty state without pets. */
  pets: CheckPet[]
  /** Preselected pet, already checked to be one of `pets`. */
  initialPetId: string
  /** Balance when the page was rendered. */
  credits: number
  /** Signed links of the pets' own photos; a pet without one shows its species drawing. */
  photos?: Record<string, string>
  /**
   * A re-check «с учётом прошлой» (FU-03): the case whose previous check and
   * answers the server adds to the analysis, and the plaque that says so.
   */
  recheck?: RecheckContext | null
}

export type RecheckContext = {
  caseId: string
  /** The case's pet: another pet chosen in the form drops the link. */
  petId: string
  /** «Учтём проверку от 23 октября и 2 отметки». */
  label: string
}

type Phase = 'form' | 'loading' | 'error'

type CheckResponse = SymptomCheckResult & { credits_remaining: number; check_id?: string }

/**
 * The symptom check: pet, description, optional follow-up answers.
 *
 * Everything typed lives here, above the form, so the waiting and error
 * states can replace the form without losing a word of it. A result is shown
 * on its own page; the form only renders one itself if the answer came back
 * without an id.
 */
export default function CheckForm({ pets, initialPetId, credits: initialCredits, photos = {}, recheck = null }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const locale = useLocale()
  const t = dict.check
  const options = checkOptions(t)
  const ids = useId()

  const [petId, setPetId] = useState(initialPetId)
  const [symptoms, setSymptoms] = useState('')
  const [appetite, setAppetite] = useState('')
  const [activity, setActivity] = useState('')
  const [duration, setDuration] = useState('')
  const [stool, setStool] = useState('')
  const [painSigns, setPainSigns] = useState<string[]>([])
  /** «Выбрать другого питомца»: the choice of pet, shown when asked for. */
  const [choosingPet, setChoosingPet] = useState(false)
  const petSelect = useRef<HTMLSelectElement>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [credits, setCredits] = useState(initialCredits)
  // The balance ran out while the page was open: say so as it happens.
  const [creditsRefused, setCreditsRefused] = useState(false)
  const [formError, setFormError] = useState('')
  const [failure, setFailure] = useState('')
  const [inlineResult, setInlineResult] = useState<SymptomCheckView | null>(null)

  const inFlight = useRef(false)
  const statusHeading = useRef<HTMLHeadingElement>(null)
  const symptomsField = useRef<HTMLTextAreaElement>(null)
  const returningToForm = useRef(false)

  /** «Не учитывать», or a case the server refused: the check goes as a new one. */
  const [recheckKept, setRecheckKept] = useState(true)

  const pet = pets.find(p => p.id === petId) ?? pets[0]
  const linkedCase = recheck && recheckKept && pet?.id === recheck.petId ? recheck : null
  const trimmedLength = symptoms.trim().length
  const tooShort = trimmedLength < SYMPTOMS_MIN
  const noCredits = credits <= 0

  // Focus follows the state that replaced the form, and comes back to the
  // description when the form returns.
  useEffect(() => {
    if (choosingPet) petSelect.current?.focus()
  }, [choosingPet])

  useEffect(() => {
    if (phase !== 'form') {
      statusHeading.current?.focus()
    } else if (returningToForm.current) {
      returningToForm.current = false
      symptomsField.current?.focus()
    }
  }, [phase])

  async function submit() {
    if (inFlight.current || noCredits || tooShort) return
    inFlight.current = true
    setFormError('')
    setPhase('loading')

    let res: Response
    try {
      res = await fetch('/api/symptom-check', {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          symptoms,
          pet_id: petId || undefined,
          appetite: appetite || undefined,
          activity: activity || undefined,
          duration: duration || undefined,
          stool: stool || undefined,
          pain_signs: painSigns.length ? painSigns : undefined,
          // The owner's day the pet's medical record is read on for the analysis.
          today: localToday(),
          // A re-check: the server adds the case's previous check and answers.
          ...(linkedCase ? { followup_case_id: linkedCase.caseId } : {}),
        }),
      })
    } catch {
      inFlight.current = false
      setFailure(t.errorOffline)
      setPhase('error')
      return
    }

    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      // A gateway error page is not JSON; the status says enough.
    }

    if (!res.ok) {
      if (res.status === 401) {
        // Stay on the waiting screen while the sign-in page loads.
        router.push(`/login?next=${encodeURIComponent(`/check?pet=${petId}`)}`)
        return
      }
      inFlight.current = false
      if (res.status === 402) {
        setCredits(0)
        setCreditsRefused(true)
        setPhase('form')
      } else if (res.status === 400) {
        setFormError(
          t.errorInvalid.replace('{min}', String(SYMPTOMS_MIN)).replace('{max}', String(SYMPTOMS_MAX)),
        )
        setPhase('form')
      } else if (res.status === 404) {
        setFormError(t.errorPetMissing)
        setPhase('form')
      } else if (res.status === 409 && linkedCase) {
        // The case cannot take a re-check any more; nothing was charged. The
        // owner decides whether to send it as a new check.
        setRecheckKept(false)
        setFormError(dict.followup.recheckRefused)
        setPhase('form')
      } else {
        setFailure(res.status === 429 ? t.errorBusy : t.errorText)
        setPhase('error')
      }
      return
    }

    const result = data as CheckResponse
    if (result.check_id) {
      // Keep the waiting screen (and the guard) until the result page opens.
      router.push(`/check/${result.check_id}`)
      router.refresh()
      return
    }

    inFlight.current = false
    setCredits(result.credits_remaining)
    setInlineResult(toView(result))
    setPhase('form')
    router.refresh()
  }

  function toView(result: CheckResponse): SymptomCheckView {
    return {
      id: null,
      symptoms_input: symptoms,
      urgency: result.urgency,
      urgency_reason: result.urgency_reason,
      possible_causes: result.possible_causes,
      species_specific_warning: result.species_specific_warning ?? null,
      home_care_steps: result.home_care_steps,
      vet_questions: result.vet_questions,
      // The answer has just come back in the language this page is read in.
      locale,
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
      pet_id: pet?.id ?? null,
      pet_name: pet?.name ?? null,
      pet_species: pet?.species ?? null,
    }
  }

  function startOver() {
    setInlineResult(null)
    setSymptoms('')
    setAppetite('')
    setActivity('')
    setDuration('')
    setStool('')
    setPainSigns([])
    returningToForm.current = true
    setPhase('form')
  }

  function backToForm() {
    returningToForm.current = true
    setPhase('form')
  }

  if (inlineResult) {
    return (
      <CheckResultContent
        check={inlineResult}
        dict={dict}
        locale={locale}
        pet={pet}
        onNewCheck={startOver}
      />
    )
  }

  if (phase === 'loading') {
    return (
      <>
        <div className="pagehead"><h1>{t.pageTitle}</h1></div>
        <section className="card loading-box" role="status" aria-live="polite">
          <Illustration name="paw" size={185} />
          <h2 ref={statusHeading} tabIndex={-1}>{t.loadingTitle}</h2>
          <p>{t.loadingText}</p>
          <div className="spinner" aria-hidden />
        </section>
      </>
    )
  }

  if (phase === 'error') {
    return (
      <>
        <div className="pagehead"><h1>{t.pageTitle}</h1></div>
        <section className="card loading-box" role="alert">
          <Illustration name="paw" size={185} />
          <h2 ref={statusHeading} tabIndex={-1}>{t.errorTitle}</h2>
          <p>{failure || t.errorText}</p>
          <button type="button" className="btn primary" onClick={backToForm}>
            {t.backToForm}
          </button>
          <div className="check-retry">
            <button type="button" className="link" onClick={() => void submit()}>
              {t.retry}
            </button>
          </div>
        </section>
      </>
    )
  }

  const petLine = pet ? petSummary(pet, dict, locale) : ''
  const facts = pet ? petHealthFacts(pet, dict, locale) : { age: null, chronic: null }
  const factsLine = [facts.age, facts.chronic].filter(Boolean).join(' · ')
  const factsId = `${ids}-pet-facts`
  const symptomsHintId = `${ids}-symptoms-hint`
  const symptomsFieldId = `${ids}-symptoms`

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{t.pageTitle}</h1>
          <p>
            {linkedCase && pet
              ? dict.followup.recheckSubtitle.replace('{name}', () => pet.name)
              : pet
                ? t.checkingFor.replace('{name}', () => pet.name)
                : t.pageSubtitle}
          </p>
        </div>
        {pets.length > 1 && !choosingPet && (
          <button type="button" className="link" onClick={() => setChoosingPet(true)}>
            {t.choosePet}
          </button>
        )}
      </div>

      <form
        className="care-columns check-columns"
        onSubmit={e => { e.preventDefault(); void submit() }}
        aria-labelledby={`${ids}-title`}
        noValidate
      >
        <div>
          {linkedCase && (
            <div className="followup-plaque" role="group" aria-label={linkedCase.label}>
              <strong>{linkedCase.label}</strong>
              <button type="button" className="link" onClick={() => setRecheckKept(false)}>
                {dict.followup.recheckDrop}
              </button>
            </div>
          )}

          <section className="card check-form">
            <div className="section-head">
              <h2 id={`${ids}-title`}>{t.formTitle}</h2>
              <span className="small muted nowrap">{t.formCost}</span>
            </div>

            {noCredits && (
              <div className="banner check-notice" role={creditsRefused ? 'alert' : undefined}>
                <strong>{t.noCreditsTitle}</strong>
                <p>{t.noCreditsText}</p>
                <Link href="/credits" className="link">
                  {t.noCreditsAction}
                  <Icon name="arrow" />
                </Link>
              </div>
            )}

            {choosingPet && (
              <label className="field">
                <span className="field-label">{t.petLabel}</span>
                <select
                  ref={petSelect}
                  className="input"
                  value={pet?.id ?? ''}
                  onChange={e => setPetId(e.target.value)}
                  aria-describedby={factsLine ? factsId : undefined}
                >
                  {pets.map(p => {
                    const line = petSummary(p, dict, locale, ', ')
                    return (
                      <option key={p.id} value={p.id}>
                        {line ? `${p.name} · ${line}` : p.name}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}
            {/* Phones only (the pet's card comes after the form there): the chosen
                pet's age and chronic conditions, right under the choice. */}
            {choosingPet && factsLine && (
              <p id={factsId} className="check-pet-inline" aria-live="polite">{factsLine}</p>
            )}

            <div className="field">
              <label className="field-label" htmlFor={symptomsFieldId}>
                {t.symptomsLabel}
                <span aria-hidden> *</span>
              </label>
              <textarea
                id={symptomsFieldId}
                ref={symptomsField}
                className="input"
                value={symptoms}
                onChange={e => setSymptoms(e.target.value)}
                placeholder={t.symptomsHint}
                required
                minLength={SYMPTOMS_MIN}
                maxLength={SYMPTOMS_MAX}
                rows={5}
                aria-describedby={symptomsHintId}
              />
              <span className="field-hint check-symptoms-meta">
                <span id={symptomsHintId}>{tooShort ? t.symptomsRequired : ''}</span>
                <span className="check-counter">
                  {t.symptomsCount.replace('{n}', String(symptoms.length)).replace('{max}', String(SYMPTOMS_MAX))}
                </span>
              </span>
            </div>

            <div className="banner">{linkedCase ? dict.followup.recheckNote : t.writeFreely}</div>

            <div className="form-grid">
              <ChipGroup id={`${ids}-duration`} label={t.duration} options={options.duration} value={duration} onChange={setDuration} />
              <ChipGroup id={`${ids}-appetite`} label={t.appetite} options={options.appetite} value={appetite} onChange={setAppetite} />
            </div>
          </section>

          <section className="card check-form" aria-labelledby={`${ids}-clarify`}>
            <h2 id={`${ids}-clarify`} className="check-clarify">
              {t.clarifyTitle}
              <span className="optional">{t.optional}</span>
            </h2>

            <div className="form-grid">
              <ChipGroup id={`${ids}-activity`} label={t.activity} options={options.activity} value={activity} onChange={setActivity} />
              <label className="field">
                <span className="field-label">{t.stool}</span>
                <select
                  className={stool ? 'input' : 'input is-empty'}
                  value={stool}
                  onChange={e => setStool(e.target.value)}
                >
                  <option value="">{t.stoolUnset}</option>
                  {options.stool.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>

            <MultiChipGroup
              id={`${ids}-pain`}
              label={t.painSigns}
              options={options.painSigns}
              values={painSigns}
              onChange={setPainSigns}
            />
          </section>

          {formError && <div className="banner error" role="alert">{formError}</div>}

          <div className="care-actions">
            <button type="submit" className="btn primary" disabled={noCredits || tooShort}>
              {t.checkSymptoms}
              <Icon name="arrow" />
            </button>
            <span className="small muted">
              {noCredits ? t.noCreditsCharge : t.chargeNote.replace('{n}', String(credits))}
            </span>
          </div>
        </div>

        <aside>
          {pet && (
            <section className="card soft check-pet-card" aria-labelledby={`${ids}-pet`}>
              <div className="row">
                <PetAvatar species={pet.species} photoUrl={photos[pet.id]} size={64} />
                <div className="check-pet">
                  <h2 id={`${ids}-pet`}>{pet.name}</h2>
                  {petLine && <p className="small">{petLine}</p>}
                </div>
              </div>
              <div className="divider" />
              {facts.chronic && <p className="small check-pet-health">{facts.chronic}</p>}
              <p className="small">{t.petContext}</p>
              <Link href={`/pets/${pet.id}/edit`} className="link">{t.viewProfile}</Link>
            </section>
          )}
          <section className="card" aria-labelledby={`${ids}-answer`}>
            <h2 id={`${ids}-answer`}>{t.answerTitle}</h2>
            <p>{t.answerText}</p>
            <div className="divider" />
            <p className="small muted">{t.answerNote}</p>
          </section>
        </aside>
      </form>
    </>
  )
}

/** One answer or none: tapping the chosen chip again clears it. */
function ChipGroup({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string
  label: string
  options: CheckOption[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className="chip-group-label">{label}</span>
      <div className="chips">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            className="chip"
            aria-pressed={value === option.value}
            onClick={() => onChange(value === option.value ? '' : option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MultiChipGroup({
  id,
  label,
  options,
  values,
  onChange,
}: {
  id: string
  label: string
  options: CheckOption[]
  values: string[]
  onChange: (values: string[]) => void
}) {
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className="chip-group-label">{label}</span>
      <div className="chips">
        {options.map(option => {
          const active = values.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={active}
              onClick={() => onChange(active ? values.filter(v => v !== option.value) : [...values, option.value])}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
