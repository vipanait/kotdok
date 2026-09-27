'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import type { HealthEvent, PetSpecies } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import { useToday } from '@/features/forms/use-today'
import type { Fresh } from '../held-record'
import { DriftNotice, useHeldRecord } from '../use-held-record'
import { RecordProblem } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import EventForm from './EventForm'
import { EVENT_FORM_KINDS, type EventFormKind } from './event-form'

type PetFacts = { petId: string; petName: string; species: PetSpecies }

/**
 * `/pets/[id]/health/new?type=vaccination`: a new record, «Сделано» today by
 * default. `today` is the owner's day from the page: the form is drawn on the
 * server, and a day read there from the browser's clock would be the server's.
 * It moves on at midnight (MW-09).
 */
export function NewEventScreen({ petId, petName, species, kind, today }: PetFacts & { kind: EventFormKind; today: string }) {
  const day = useToday(today)
  return <EventForm petId={petId} petName={petName} species={species} kind={kind} plan={null} today={day} />
}

/** What the latest load says about the plan being edited. */
function freshPlan(events: HealthEvent[], eventId: string): Fresh<HealthEvent> {
  const event = events.find((entry) => entry.id === eventId)
  if (!event || event.kind === 'visit') return { kind: 'gone' }
  return event.status === 'done' ? { kind: 'closed' } : { kind: 'open', record: event }
}

/**
 * `/pets/[id]/health/[eventId]/edit`: the plan's own day, items and notes,
 * read through the v1 API. A plan that was marked done meanwhile (the page
 * checked it a moment ago) is not opened as a form: something done is only
 * read (owner rule of 26 September 2026).
 */
export function EditEventScreen({ petId, petName, species, eventId, kind }: PetFacts & { eventId: string; kind: EventFormKind }) {
  const dict = useTranslations()
  const { state, reload, today } = useMedicalRecord(petId)
  // The form keeps the plan it opened with while the owner types; a refresh underneath only tells (MW-09).
  const held = useHeldRecord(state.status === 'ready' ? freshPlan(state.data.overview.events, eventId) : null)

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }

  const event = held.record
  const heldKind = event?.kind
  if (event && heldKind && heldKind !== 'visit') {
    // Keyed by the plan and the load it started from: fields start from its values once.
    return (
      <EventForm
        key={`${event.id}-${held.version}`}
        petId={petId}
        petName={petName}
        species={species}
        kind={heldKind}
        plan={event}
        today={today}
        onDirtyChange={held.setDirty}
        notice={
          <DriftNotice
            drift={held.drift}
            onTakeLatest={held.takeLatest}
            sectionHref={medicalRecordHref.section(petId, EVENT_FORM_KINDS[heldKind].section)}
            recordHref={medicalRecordHref.recordView(petId, event.id)}
          />
        }
      />
    )
  }

  const found = state.data.overview.events.find((entry) => entry.id === eventId)
  // Done meanwhile: only read. Gone: back to the section of the kind the page found it as.
  if (found && found.kind !== 'visit' && found.status === 'done') return <EventDone petId={petId} eventId={found.id} />
  return <EventGone petId={petId} kind={kind} />
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
