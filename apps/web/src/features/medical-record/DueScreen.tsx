'use client'

import { useState } from 'react'
import Link from 'next/link'
import { localToday } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { RecordProblem, StaleNotice } from './MedicalRecordScreen'
import { DueRows } from './MedicalRecordView'
import SavedNotice from './SavedNotice'
import { medicalRecordHref } from './stage'
import { useMedicalRecord } from './use-medical-record'
import { allDue } from './view-model'

/**
 * `/pets/[id]/health/due` — every due date of the pet (web v1 «due»), in the
 * shared order: overdue first, then the soonest, then the rest. Each says
 * how far it is in words and with an icon, never by colour alone; overdue is
 * a calendar fact, not a medical alarm. «Сделано» marks that one item.
 */
export default function DueScreen({ petId, saved }: { petId: string; saved: boolean }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.medicalRecord.due
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<DueSkeleton title={words.pageTitle} label={dict.medicalRecord.states.loading} />} />
  }

  const { overview } = state.data
  const due = allDue(dict, locale, overview, today)

  return (
    <div className="health-page due-page">
      <div className="pagehead">
        <div>
          <h1>{due.total > 0 ? words.all.replace('{n}', String(due.total)) : words.pageTitle}</h1>
          <p>{overview.pet.name}</p>
        </div>
        <Link href={medicalRecordHref.record(petId)} className="link">
          {words.pageBack}
        </Link>
      </div>

      {saved && <SavedNotice text={words.saved} />}
      <StaleNotice state={state} reload={reload} />

      {due.rows.length === 0 ? (
        <section className="card events-empty" aria-labelledby="due-empty-title">
          <h2 id="due-empty-title">{words.emptyTitle}</h2>
          <p>{words.emptyBody}</p>
        </section>
      ) : (
        <section className="card health-due due-list" aria-label={words.listLabel}>
          <DueRows rows={due.rows} />
        </section>
      )}
    </div>
  )
}

function DueSkeleton({ title, label }: { title: string; label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="pagehead" aria-hidden>
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="skeleton-block weight-skeleton-main" aria-hidden />
    </div>
  )
}
