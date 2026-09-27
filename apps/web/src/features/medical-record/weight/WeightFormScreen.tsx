'use client'

import type { WeightMeasurement } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import { useToday } from '@/features/forms/use-today'
import type { Fresh } from '../held-record'
import { FormNotice, FormSkeleton } from '../form-parts'
import { RecordProblem } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../routes'
import { DriftNotice, useHeldRecord } from '../use-held-record'
import { useMedicalRecord } from '../use-medical-record'
import WeightForm from './WeightForm'

/**
 * `/pets/[id]/health/new?type=weight`: a new weighing, today's by default.
 * `today`: the owner's day from the page, the same on the server and in the browser.
 * `formWeight` (`&from=form`, «Уточнить» on the pet form's weight with no
 * history yet): the weighing starts from that value and no day, for the
 * owner to date it.
 */
export function NewWeightScreen({
  petId,
  petName,
  today,
  formWeight = null,
}: {
  petId: string
  petName: string
  today: string
  formWeight?: number | null
}) {
  // The owner's day from the page, moving on at midnight (MW-09).
  const day = useToday(today)
  return <WeightForm petId={petId} petName={petName} editing={null} today={day} formWeight={formWeight} />
}

/** What the latest load says about the measurement being corrected. */
function freshWeight(weights: WeightMeasurement[], weightId: string): Fresh<WeightMeasurement> {
  const weight = weights.find((entry) => entry.id === weightId)
  return weight ? { kind: 'open', record: weight } : { kind: 'gone' }
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
  const { state, reload, today } = useMedicalRecord(petId)
  // The form keeps the measurement it opened with while the owner types; a refresh underneath only tells (MW-09).
  const held = useHeldRecord(state.status === 'ready' ? freshWeight(state.data.overview.weights, weightId) : null)

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton title={form.editTitle} label={dict.medicalRecord.states.loading} size="weight" />} />
  }

  const weight = held.record
  if (!weight) return <WeightGone petId={petId} />
  // Keyed by the measurement and the load it started from: the fields start from its values once.
  return (
    <WeightForm
      key={`${weight.id}-${held.version}`}
      petId={petId}
      petName={petName}
      editing={weight}
      today={today}
      onDirtyChange={held.setDirty}
      notice={
        <DriftNotice
          drift={held.drift}
          onTakeLatest={held.takeLatest}
          sectionHref={medicalRecordHref.section(petId, 'weight')}
          recordHref={null}
        />
      }
    />
  )
}

function WeightGone({ petId }: { petId: string }) {
  const form = useTranslations().medicalRecord.weightForm
  return (
    <FormNotice
      id="weight-gone"
      title={form.notFoundTitle}
      body={form.notFoundBody}
      href={medicalRecordHref.section(petId, 'weight')}
      action={form.backToHistory}
    />
  )
}

