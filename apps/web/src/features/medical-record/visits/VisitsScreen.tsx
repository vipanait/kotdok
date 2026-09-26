'use client'

import { useState } from 'react'
import Link from 'next/link'
import { localToday } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import SavedNotice from '../SavedNotice'
import { medicalRecordHref, sectionOpen } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import { usePetChecks } from './use-pet-checks'
import { visitsPage, type VisitCard, type VisitSaved } from './visit-view'

/**
 * `/pets/[id]/health/visits` (web v1 «visits», «visits-empty»): the planned
 * visits, soonest first, then those that happened, newest first — each a
 * card that opens it. A visit that followed a check says which, with the
 * check's urgency.
 */
export default function VisitsScreen({ petId, saved }: { petId: string; saved: VisitSaved | null }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.medicalRecord
  const page = words.visitsPage
  const { state, reload } = useMedicalRecord(petId)
  const checks = usePetChecks(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<VisitsSkeleton title={page.title} label={words.states.loading} />} />
  }

  const { overview } = state.data
  const addable = sectionOpen('visits', overview.writable)
  const view = visitsPage(dict, locale, overview, checks.items, today)
  const addHref = medicalRecordHref.newRecord(petId, 'visit')

  return (
    <div className="health-page events-page visits-page">
      <Link href={medicalRecordHref.record(petId)} className="link health-back">
        <Icon name="back" />
        {page.back}
      </Link>

      <div className="pagehead">
        <div>
          <h1>{page.title}</h1>
          <p>{view.subtitle}</p>
        </div>
        {addable && !view.empty && (
          <Link href={addHref} className="btn primary">
            {page.add}
            <Icon name="plus" />
          </Link>
        )}
      </div>

      {saved && <SavedNotice text={page.saved[saved]} />}
      <StaleNotice state={state} reload={reload} />

      {view.empty ? (
        <section className="card events-empty visits-empty" aria-labelledby="visits-empty-title">
          <Icon name="visit" />
          <h2 id="visits-empty-title">{page.emptyTitle}</h2>
          <p>{page.emptyBody}</p>
          {addable && <Link href={addHref} className="btn primary">{page.add}</Link>}
        </section>
      ) : (
        <div className="section-layout">
          <div className="section-main">
            {view.planned.length > 0 && <VisitList id="visits-planned" title={page.planned} cards={view.planned} dict={dict} />}
            {view.done.length > 0 && <VisitList id="visits-done" title={page.done} cards={view.done} dict={dict} />}
          </div>
          <aside className="section-aside">
            <section className="card health-facts visits-aside" aria-labelledby="visits-aside-title">
              <h2 id="visits-aside-title">{page.asideTitle}</h2>
              <p>{page.asideBody}</p>
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}

function VisitList({ id, title, cards, dict }: { id: string; title: string; cards: VisitCard[]; dict: Dictionary }) {
  return (
    <section className="event-list" aria-labelledby={id}>
      <h2 id={id} className="event-list-title">{title}</h2>
      <ul>
        {cards.map((card) => (
          <li key={card.id}>
            <Link href={card.href} className="card event-card visit-card" aria-label={card.label}>
              <strong className="event-card-day">{card.day}</strong>
              <span className="event-card-clinic">{[card.kind, card.clinic].filter(Boolean).join(' · ')}</span>
              {card.summary && <span className="event-card-items">{card.summary}</span>}
              {card.due && (
                <span className={`event-due ${card.due.tone}`}>
                  <Icon name={card.due.tone === 'overdue' ? 'calendarLate' : 'calendar'} />
                  {card.due.text}
                </span>
              )}
              {card.check && (
                <span className="visit-card-check">
                  {card.check.urgency && <UrgencyBadge urgency={card.check.urgency} dict={dict} />}
                  <span>{card.check.text}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function VisitsSkeleton({ title, label }: { title: string; label: string }) {
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
