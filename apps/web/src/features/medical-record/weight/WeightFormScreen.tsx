'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { localToday } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import { RecordProblem } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import WeightForm from './WeightForm'

/**
 * `/pets/[id]/health/new?type=weight`: a new weighing, today's by default.
 * `today`: the owner's day from the page, the same on the server and in the browser.
 */
export function NewWeightScreen({ petId, petName, today }: { petId: string; petName: string; today: string }) {
  return <WeightForm petId={petId} petName={petName} editing={null} today={today} />
}

/**
 * `/pets/[id]/health/[weightId]/edit`: the form filled with that one
 * measurement's own day and value, read through the v1 API like the rest of
 * the record. A measurement that is gone by the time it loads is said so,
 * not replaced by another one.
 */
export function EditWeightScreen({ petId, petName, weightId }: { petId: string; petName: string; weightId: string }) {
  const dict = useTranslations()
  const form = dict.medicalRecord.weightForm
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton title={form.editTitle} label={dict.medicalRecord.states.loading} />} />
  }

  const weight = state.data.overview.weights.find((entry) => entry.id === weightId)
  if (!weight) return <WeightGone petId={petId} />
  // Keyed by the measurement: the fields start from its values once, and a refresh underneath does not reset them.
  return <WeightForm key={weight.id} petId={petId} petName={petName} editing={weight} today={today} />
}

function WeightGone({ petId }: { petId: string }) {
  const dict = useTranslations()
  const form = dict.medicalRecord.weightForm
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <section className="card health-problem" aria-labelledby="weight-gone-title">
      <h1 id="weight-gone-title" ref={ref} tabIndex={-1}>{form.notFoundTitle}</h1>
      <p>{form.notFoundBody}</p>
      <Link href={medicalRecordHref.section(petId, 'weight')} className="btn primary">{form.backToHistory}</Link>
    </section>
  )
}

function FormSkeleton({ title, label }: { title: string; label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="pagehead" aria-hidden>
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="skeleton-block record-form weight-skeleton-form" aria-hidden />
    </div>
  )
}
