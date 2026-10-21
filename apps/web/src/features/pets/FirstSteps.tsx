'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PetSpecies } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import { browserApi } from '@/features/api/browser-api'
import { useToday } from '@/features/forms/use-today'
import { eventSaveFailure } from '@/features/medical-record/events/event-form'
import { recordCache } from '@/features/medical-record/record-load'
import { medicalRecordHref } from '@/features/medical-record/routes'
import {
  FIRST_VACCINES,
  LAST_VISITS,
  firstStepsRequests,
  toggleVaccine,
  type FirstStepsDraft,
  type FirstVaccine,
} from './first-steps'

/**
 * «Прививки и врач» (design `first-steps`): optional, after a pet added the
 * ordinary way — never on the onboarding paths, never with «Добавим первую
 * запись?». Unknown days may be left out; nothing is recorded that the owner
 * did not say. A retry after a failure sends only what did not go through,
 * and each record goes with its own key, so a second «Сохранить» adds nothing.
 */
export default function FirstSteps({
  petId,
  petName,
  species,
  vaccinated,
  today: pageToday,
}: {
  petId: string
  petName: string
  species: PetSpecies
  /** The form's «Вакцинация» as saved: «привит(а)» is set only when it is not already. */
  vaccinated: boolean | null
  today: string
}) {
  const dict = useTranslations()
  const t = dict.firstSteps
  const router = useRouter()
  const today = useToday(pageToday)
  const id = useId()
  const [draft, setDraft] = useState<FirstStepsDraft>({ vaccines: [], dates: {}, lastVisit: null })
  const [wrong, setWrong] = useState<FirstVaccine | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [offer, setOffer] = useState(false)
  const inFlight = useRef(false)
  const keys = useRef(new Map<string, string>())
  const sent = useRef(new Set<string>())

  const recordHref = medicalRecordHref.record(petId)
  const chosen = draft.vaccines.filter((choice): choice is FirstVaccine => choice !== 'unknown')
  const labels = { complex: t.complex, rabies: t.rabies, unknown: t.unknown }
  const dateLabels = { complex: t.dateComplex, rabies: t.dateRabies }

  async function save() {
    if (inFlight.current) return
    const read = firstStepsRequests(draft, species, today)
    if (!read.ok) {
      setWrong(read.choice)
      document.getElementById(`${id}-${read.choice}`)?.focus()
      return
    }
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const api = browserApi()
      if (read.vaccinatedWithoutDate && vaccinated !== true && !sent.current.has('vaccinated')) {
        await api.updatePet(petId, { vaccinated: true })
        sent.current.add('vaccinated')
      }
      for (const event of read.events) {
        const body = JSON.stringify(event)
        if (sent.current.has(body)) continue
        if (!keys.current.has(body)) keys.current.set(body, crypto.randomUUID())
        await api.createHealthEvent(petId, event, keys.current.get(body)!)
        sent.current.add(body)
      }
      recordCache.forget(petId)
      if (read.offerCheckup) {
        setOffer(true)
        inFlight.current = false
        setBusy(false)
        return
      }
      router.push(recordHref)
    } catch (cause) {
      const failure = eventSaveFailure(cause)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      inFlight.current = false
      setBusy(false)
      setError(failure === 'offline' ? t.offline : t.saveFailed)
    }
  }

  if (offer) {
    return (
      <>
        <Head title={t.title} subtitle={t.subtitle.replace('{name}', () => petName)} />
        <section className="card first-steps-offer" aria-labelledby={`${id}-offer`}>
          <h2 id={`${id}-offer`}>{t.checkupTitle}</h2>
          <p>{t.checkupBody}</p>
          <div className="care-actions">
            <Link href={medicalRecordHref.newRecord(petId, 'visit')} className="btn primary">
              {t.checkupPlan}
            </Link>
            <Link href={recordHref} className="link">
              {t.notNow}
            </Link>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <Head title={t.title} subtitle={t.subtitle.replace('{name}', () => petName)} />
      <form
        className="care-columns"
        noValidate
        aria-busy={busy || undefined}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div>
          <section className="card" aria-labelledby={`${id}-vaccines`}>
            <h2 id={`${id}-vaccines`}>{t.vaccinesTitle}</h2>
            <p className="muted">{t.vaccinesHint}</p>
            <div className="chips" role="group" aria-labelledby={`${id}-vaccines`}>
              {FIRST_VACCINES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="chip"
                  aria-pressed={draft.vaccines.includes(choice)}
                  onClick={() => {
                    setWrong(null)
                    setDraft((current) => ({ ...current, vaccines: toggleVaccine(current.vaccines, choice) }))
                  }}
                >
                  {labels[choice]}
                </button>
              ))}
            </div>

            {chosen.map((choice) => (
              <div key={choice} className="field">
                <label className="field-label" htmlFor={`${id}-${choice}`}>
                  {dateLabels[choice]}
                </label>
                <input
                  id={`${id}-${choice}`}
                  type="date"
                  className="input"
                  max={today}
                  value={draft.dates[choice] ?? ''}
                  aria-invalid={wrong === choice || undefined}
                  aria-describedby={wrong === choice ? `${id}-${choice}-error` : undefined}
                  onChange={(event) => {
                    const value = event.target.value
                    setWrong(null)
                    setDraft((current) => ({ ...current, dates: { ...current.dates, [choice]: value } }))
                  }}
                />
                {wrong === choice && (
                  <span id={`${id}-${choice}-error`} className="field-error" role="alert">
                    {t.datePast}
                  </span>
                )}
              </div>
            ))}
            {chosen.some((choice) => !(draft.dates[choice] ?? '').trim()) && <p className="field-hint">{t.noDateNote}</p>}
          </section>

          <section className="card" aria-labelledby={`${id}-visit`}>
            <h2 id={`${id}-visit`}>{t.visitTitle}</h2>
            <div className="chips" role="group" aria-labelledby={`${id}-visit`}>
              {LAST_VISITS.map((visit) => (
                <button
                  key={visit}
                  type="button"
                  className="chip"
                  aria-pressed={draft.lastVisit === visit}
                  onClick={() => setDraft((current) => ({ ...current, lastVisit: current.lastVisit === visit ? null : visit }))}
                >
                  {t.visits[visit]}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <p role="alert" className="banner error">
              {error}
            </p>
          )}

          <div className="care-actions">
            <button type="submit" className="btn primary" aria-disabled={busy || undefined}>
              {busy ? t.saving : t.save}
            </button>
            <Link href="/pets?petSaved=created" className="link">
              {t.skip}
            </Link>
          </div>
        </div>

        <div>
          <section className="card soft" aria-labelledby={`${id}-later`}>
            <h2 id={`${id}-later`}>{t.laterTitle}</h2>
            <p>{t.laterBody}</p>
          </section>
        </div>
      </form>
    </>
  )
}

function Head({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pagehead">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  )
}
