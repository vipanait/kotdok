'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { localToday } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import { RecordProblem } from '../MedicalRecordScreen'
import { medicalRecordHref, type CompleteFrom } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import { usePetChecks } from './use-pet-checks'
import VisitForm from './VisitForm'
import type { CheckLink } from './visit-view'

type PetFacts = { petId: string; petName: string }

/** The check result a new visit is written from: its id, its first line as the reason, and how it is named. */
export type VisitFromCheck = { checkId: string; reason: string; link: CheckLink }

/**
 * `/pets/[id]/health/new?type=visit`: a new visit, «Был» today and empty.
 * With `&check=` (from a result, the page checked it is this pet's) it is
 * «Болезнь», the check's first line as the reason and that check linked;
 * «Назад» leads back to the result. `today`: the owner's day from the page,
 * the same on the server and in the browser.
 */
export function NewVisitScreen({ petId, petName, fromCheck, today }: PetFacts & { fromCheck: VisitFromCheck | null; today: string }) {
  const checks = usePetChecks(petId)
  const backHref = fromCheck ? fromCheck.link.href : medicalRecordHref.section(petId, 'visits')
  return (
    <VisitForm
      petId={petId}
      petName={petName}
      mode={{ kind: 'new', source: fromCheck ? { checkId: fromCheck.checkId, reason: fromCheck.reason, link: fromCheck.link } : null }}
      checks={checks.items}
      today={today}
      backHref={backHref}
      doneHref={(visitId, saved) => `${medicalRecordHref.recordView(petId, visitId)}?saved=${saved}`}
      onStale={() => {}}
    />
  )
}

/**
 * `/pets/[id]/health/[visitId]/edit`: a planned visit's own values, to
 * change or move. A visit that happened meanwhile (the page checked it a
 * moment ago) is not opened as a form: it is only read (owner rule of 26
 * September 2026).
 */
export function EditVisitScreen({ petId, petName, visitId }: PetFacts & { visitId: string }) {
  return <PlanScreen petId={petId} petName={petName} visitId={visitId} kind="edit" from="record" />
}

/**
 * `/pets/[id]/health/[visitId]/complete`: «Состоялся» on a plan — its own
 * step with the real day, what was found and prescribed, and the warning
 * that the visit cannot be changed afterwards.
 */
export function HeldVisitScreen({ petId, petName, visitId, from }: PetFacts & { visitId: string; from: CompleteFrom }) {
  return <PlanScreen petId={petId} petName={petName} visitId={visitId} kind="held" from={from} />
}

function heldBack(petId: string, visitId: string, from: CompleteFrom): string {
  if (from === 'due') return medicalRecordHref.due(petId)
  if (from === 'medical') return medicalRecordHref.record(petId)
  if (from === 'section') return medicalRecordHref.section(petId, 'visits')
  return medicalRecordHref.recordView(petId, visitId)
}

function PlanScreen({
  petId,
  petName,
  visitId,
  kind,
  from,
}: PetFacts & { visitId: string; kind: 'edit' | 'held'; from: CompleteFrom }) {
  const dict = useTranslations()
  const { state, reload } = useMedicalRecord(petId)
  const checks = usePetChecks(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }

  const visit = state.data.overview.events.find((entry) => entry.id === visitId)
  if (!visit || visit.kind !== 'visit') return <VisitGone petId={petId} />
  if (visit.status === 'done') return <VisitDone petId={petId} visitId={visit.id} held={kind === 'held'} />

  const back = kind === 'edit' ? medicalRecordHref.recordView(petId, visit.id) : heldBack(petId, visit.id, from)
  return (
    // Keyed by the plan: the fields start from its values once; a refresh underneath does not reset them.
    <VisitForm
      key={visit.id}
      petId={petId}
      petName={petName}
      mode={kind === 'edit' ? { kind: 'edit', plan: visit } : { kind: 'held', plan: visit }}
      checks={checks.items}
      today={today}
      backHref={back}
      doneHref={(savedId, saved) => {
        if (kind === 'held' && from === 'due') return `${medicalRecordHref.due(petId)}?saved=completed`
        if (kind === 'held' && from === 'section') return `${medicalRecordHref.section(petId, 'visits')}?saved=held`
        return `${medicalRecordHref.recordView(petId, savedId)}?saved=${saved}`
      }}
      onStale={reload}
    />
  )
}

function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}

export function VisitGone({ petId }: { petId: string }) {
  const dict = useTranslations()
  const words = dict.medicalRecord.visitRecord
  const ref = useFocusOnMount<HTMLHeadingElement>()
  return (
    <section className="card health-problem" aria-labelledby="visit-gone-title">
      <h1 id="visit-gone-title" ref={ref} tabIndex={-1}>{words.notFoundTitle}</h1>
      <p>{words.notFoundBody}</p>
      <Link href={medicalRecordHref.section(petId, 'visits')} className="btn primary">{words.back}</Link>
    </section>
  )
}

/** A visit that happened, where a form was asked for: it is only read. */
function VisitDone({ petId, visitId, held }: { petId: string; visitId: string; held: boolean }) {
  const dict = useTranslations()
  const words = dict.medicalRecord.visitRecord
  const ref = useFocusOnMount<HTMLHeadingElement>()
  return (
    <section className="card health-problem" aria-labelledby="visit-done-title">
      <h1 id="visit-done-title" ref={ref} tabIndex={-1}>{held ? words.heldTitle : words.doneTitle}</h1>
      <p>{words.doneBody2}</p>
      <Link href={medicalRecordHref.recordView(petId, visitId)} className="btn primary">{words.openRecord}</Link>
    </section>
  )
}

function FormSkeleton({ label }: { label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="skeleton-block record-form event-skeleton-form" aria-hidden />
    </div>
  )
}
