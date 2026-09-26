'use client'

import { useState } from 'react'
import Link from 'next/link'
import { localToday } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import SavedNotice from '../SavedNotice'
import { medicalRecordHref, sectionOpen } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import { EVENT_FORM_KINDS, type EventFormKind } from './event-form'
import { eventsPage, type EventCard, type EventSaved } from './event-view'

/**
 * `/pets/[id]/health/vaccinations` and `/parasites` (web v1 «vaccines»,
 * «vaccines-empty», «parasites», «parasites-empty»): the plans, soonest
 * first, then what was done, newest first — each record a card that opens
 * it. Beside them, the core vaccinations of the pet's species from the
 * records alone (the form's «привит» is said as the form's answer, with no
 * date) — or, for treatments, fleas with ticks and worms: the last one, the
 * next one and its «Сделано».
 */
export default function EventsScreen({ petId, kind, saved }: { petId: string; kind: EventFormKind; saved: EventSaved | null }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.medicalRecord
  const page = words.eventsPage
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<SectionSkeleton title={page[kind].title} label={words.states.loading} />} />
  }

  const { overview } = state.data
  const addable = sectionOpen(EVENT_FORM_KINDS[kind].section, overview.writable)
  const view = eventsPage(dict, locale, kind, overview, today)
  const addHref = medicalRecordHref.newRecord(petId, EVENT_FORM_KINDS[kind].recordType)

  return (
    <div className="health-page events-page">
      <Link href={medicalRecordHref.record(petId)} className="link health-back">
        <Icon name="back" />
        {page.back}
      </Link>

      <div className="pagehead">
        <div>
          <h1>{page[kind].title}</h1>
          <p>{view.subtitle}</p>
        </div>
        {addable && (
          <Link href={addHref} className="btn primary">
            {page[kind].add}
            <Icon name="plus" />
          </Link>
        )}
      </div>

      {saved && <SavedNotice text={page.saved[saved]} />}
      <StaleNotice state={state} reload={reload} />

      <div className="section-layout">
        <div className="section-main">
          {view.empty && (
            <section className="card events-empty" aria-labelledby="events-empty-title">
              <h2 id="events-empty-title">{view.empty.title}</h2>
              <p>{view.empty.body}</p>
              {addable && <Link href={addHref} className="link">{page[kind].add}</Link>}
            </section>
          )}
          {view.planned.length > 0 && <EventList id="events-planned" title={page.planned} cards={view.planned} />}
          {view.done.length > 0 && <EventList id="events-done" title={page.done} cards={view.done} />}
        </div>

        {view.covers && (
          <aside className="section-aside parasite-covers" aria-label={page.covers.label}>
            {view.covers.map((cover) => (
              <section key={cover.cover} className="card health-facts parasite-cover" aria-labelledby={`cover-${cover.cover}`}>
                <h2 id={`cover-${cover.cover}`}>{cover.title}</h2>
                <p className="cover-last">{cover.last}</p>
                {cover.product && <p className="cover-product">{cover.product}</p>}
                <div className="cover-next">
                  <span className={`event-due ${cover.next.tone}`}>
                    {cover.next.tone === 'overdue' && <Icon name="calendarLate" />}
                    {cover.next.tone === 'soon' && <Icon name="calendar" />}
                    {cover.next.text}
                  </span>
                  {cover.completeHref ? (
                    <Link href={cover.completeHref} className="link" aria-label={cover.completeLabel ?? undefined}>
                      {page.covers.markDone}
                    </Link>
                  ) : null}
                </div>
              </section>
            ))}
          </aside>
        )}

        {view.core && (
          <aside className="section-aside">
            <section className="card health-facts core-vaccines" aria-labelledby="core-title">
              <h2 id="core-title">{view.core.title}</h2>
              <ul>
                {view.core.rows.map((row) => (
                  <li key={row.target}>
                    <strong>{row.title}</strong>
                    <span>{row.text}</span>
                  </li>
                ))}
              </ul>
              <p className="core-note">{view.core.note}</p>
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}

function EventList({ id, title, cards }: { id: string; title: string; cards: EventCard[] }) {
  return (
    <section className="event-list" aria-labelledby={id}>
      <h2 id={id} className="event-list-title">{title}</h2>
      <ul>
        {cards.map((card) => (
          <li key={card.id}>
            <Link href={card.href} className="card event-card" aria-label={card.label}>
              <strong className="event-card-day">{card.day}</strong>
              {card.due && (
                <span className={`event-due ${card.due.tone}`}>
                  <Icon name={card.due.tone === 'overdue' ? 'calendarLate' : 'calendar'} />
                  {card.due.text}
                </span>
              )}
              <span className="event-card-items">{card.items.join(' · ')}</span>
              {card.clinic && <span className="event-card-clinic">{card.clinic}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SectionSkeleton({ title, label }: { title: string; label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="pagehead" aria-hidden>
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="section-layout" aria-hidden>
        <div className="skeleton-block weight-skeleton-main" />
        <div className="skeleton-block weight-skeleton-aside" />
      </div>
    </div>
  )
}
