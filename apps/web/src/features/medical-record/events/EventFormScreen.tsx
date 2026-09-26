'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { PetSpecies } from '@lapka/contracts'
import { localToday } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import { RecordProblem } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import EventForm from './EventForm'
import { EVENT_FORM_KINDS, type EventFormKind } from './event-form'

type PetFacts = { petId: string; petName: string; species: PetSpecies }

/** `/pets/[id]/health/new?type=vaccination`: a new record, «Сделано» today by default. */
export function NewEventScreen({ petId, petName, species, kind }: PetFacts & { kind: EventFormKind }) {
  const [today] = useState(() => localToday())
  return <EventForm petId={petId} petName={petName} species={species} kind={kind} plan={null} today={today} />
}

/**
 * `/pets/[id]/health/[eventId]/edit`: the plan's own day, items and notes,
 * read through the v1 API. A plan that was marked done meanwhile (the page
 * checked it a moment ago) is not opened as a form: something done is only
 * read (owner rule of 26 September 2026).
 */
export function EditEventScreen({ petId, petName, species, eventId, kind }: PetFacts & { eventId: string; kind: EventFormKind }) {
  const dict = useTranslations()
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }

  const event = state.data.overview.events.find((entry) => entry.id === eventId)
  // Gone meanwhile: back to the section of the kind the page found it as.
  if (!event || event.kind === 'visit') return <EventGone petId={petId} kind={kind} />
  if (event.status === 'done') return <EventDone petId={petId} eventId={event.id} />
  // Keyed by the plan: the fields start from its values once; a refresh underneath does not reset them.
  return <EventForm key={event.id} petId={petId} petName={petName} species={species} kind={event.kind} plan={event} today={today} />
}

function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}

export function EventGone({ petId, kind }: { petId: string; kind: EventFormKind }) {
  const dict = useTranslations()
  const words = dict.medicalRecord.eventRecord
  const ref = useFocusOnMount<HTMLHeadingElement>()
  return (
    <section className="card health-problem" aria-labelledby="event-gone-title">
      <h1 id="event-gone-title" ref={ref} tabIndex={-1}>{words.notFoundTitle}</h1>
      <p>{words.notFoundBody}</p>
      <Link href={medicalRecordHref.section(petId, EVENT_FORM_KINDS[kind].section)} className="btn primary">{words.back}</Link>
    </section>
  )
}

function EventDone({ petId, eventId }: { petId: string; eventId: string }) {
  const dict = useTranslations()
  const words = dict.medicalRecord.eventRecord
  const ref = useFocusOnMount<HTMLHeadingElement>()
  return (
    <section className="card health-problem" aria-labelledby="event-done-title">
      <h1 id="event-done-title" ref={ref} tabIndex={-1}>{words.doneTitle}</h1>
      <p>{words.doneBody2}</p>
      <Link href={medicalRecordHref.recordView(petId, eventId)} className="btn primary">{words.openRecord}</Link>
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
