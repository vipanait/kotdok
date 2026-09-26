'use client'

import { useState } from 'react'
import Link from 'next/link'
import { localToday } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import SavedNotice from '../SavedNotice'
import { medicalRecordHref, sectionOpen } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import { coursesPage, type CourseCard, type CourseSaved } from './course-view'

/**
 * `/pets/[id]/health/medications` (web v1 «medications», «medications-empty»):
 * the courses going on now, then the finished ones, each a card that opens
 * it. The same courses the medical record's «Принимает сейчас», the pet
 * form and the summary for the vet show — one list, from the server.
 */
export default function CoursesScreen({ petId, saved }: { petId: string; saved: CourseSaved | null }) {
  const dict = useTranslations()
  const words = dict.medicalRecord
  const page = words.coursesPage
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<CoursesSkeleton title={page.title} label={words.states.loading} />} />
  }

  const { overview } = state.data
  const addable = sectionOpen('medications', overview.writable)
  const view = coursesPage(dict, overview, today)
  const addHref = medicalRecordHref.newRecord(petId, 'medication')

  return (
    <div className="health-page events-page courses-page">
      <Link href={medicalRecordHref.record(petId)} className="link health-back">
        <Icon name="back" />
        {page.back}
      </Link>

      <div className="pagehead">
        <div>
          <h1>{page.title}</h1>
          <p>{view.subtitle}</p>
        </div>
        {addable && (
          <Link href={addHref} className="btn primary">
            {page.add}
            <Icon name="plus" />
          </Link>
        )}
      </div>

      {saved && <SavedNotice text={page.saved[saved]} />}
      <StaleNotice state={state} reload={reload} />

      <div className="section-layout">
        <div className="section-main">
          {view.empty && (
            <section className="card events-empty" aria-labelledby="courses-empty-title">
              <Icon name="medicine" />
              <h2 id="courses-empty-title">{view.empty.title}</h2>
              <p>{view.empty.body}</p>
              {view.empty.formNames && <p>{page.formBody.replace('{names}', view.empty.formNames)}</p>}
              {addable && <Link href={addHref} className="btn primary">{page.add}</Link>}
            </section>
          )}
          {view.current.length > 0 && <CourseList id="courses-current" title={page.current} cards={view.current} />}
          {view.past.length > 0 && <CourseList id="courses-past" title={page.past} cards={view.past} />}
        </div>

        {!view.empty && (
          <aside className="section-aside">
            <section className="card health-facts courses-aside" aria-labelledby="courses-aside-title">
              <h2 id="courses-aside-title">{page.asideTitle}</h2>
              <p>{page.asideBody}</p>
              <p className="courses-aside-form">{page.asideForm}</p>
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}

function CourseList({ id, title, cards }: { id: string; title: string; cards: CourseCard[] }) {
  return (
    <section className="event-list" aria-labelledby={id}>
      <h2 id={id} className="event-list-title">{title}</h2>
      <ul>
        {cards.map((card) => (
          <li key={card.id}>
            <Link href={card.href} className="card event-card course-card" aria-label={card.label}>
              <strong className="event-card-day">{card.title}</strong>
              {card.dosage && <span className="event-card-items">{card.dosage}</span>}
              <span className="event-card-clinic">{card.period}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CoursesSkeleton({ title, label }: { title: string; label: string }) {
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
