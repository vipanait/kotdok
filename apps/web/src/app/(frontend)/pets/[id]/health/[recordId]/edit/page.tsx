import { notFound, redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { EditEventScreen } from '@/features/medical-record/events/EventFormScreen'
import { MEDICAL_RECORD_STAGE, medicalRecordHref, recordKindOpen } from '@/features/medical-record/stage'
import { EditWeightScreen } from '@/features/medical-record/weight/WeightFormScreen'
import { EditCourseScreen } from '@/features/medical-record/medications/CourseFormScreen'
import { EditVisitScreen } from '@/features/medical-record/visits/VisitFormScreen'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { createServiceClient } from '@/server/supabase/server'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.eventRecord.edit)

/**
 * Correcting one saved record. The record is looked up for this pet and
 * this owner before anything is drawn: someone else's record, one of
 * another pet and a deleted one are a 404, like someone else's pet.
 *
 * Only what can change gets a form: a weighing, a plan (a visit's too), or a
 * current medication course. A done vaccination or treatment, a visit that
 * happened and a finished course
 * are history (owner rule of 26 September 2026) — their old edit address
 * shows the record itself, never a form; the server refuses the change
 * anyway (`record_done`).
 */
export default async function EditHealthRecordPage({ params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params
  const { cabinet, pet, dict } = await openPetPage(id, `/pets/${id}/health/${recordId}/edit`)
  const record = await findHealthRecord(createServiceClient(), cabinet.user.id, id, recordId)
  if (!record) notFound()

  if (record.kind === 'weight') {
    if (!MEDICAL_RECORD_STAGE.weight) notFound()
    return (
      <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.weightPage.title}`}>
        <EditWeightScreen key={recordId} petId={id} petName={pet.name} weightId={recordId} />
      </CabinetShell>
    )
  }

  if (record.kind === 'medication') {
    if (!MEDICAL_RECORD_STAGE.medications) notFound()
    // Finished for every owner wherever they are: history, never a form. A
    // course finished only by the owner's own day is caught by the screen.
    if (record.status === 'finished') redirect(medicalRecordHref.recordView(id, recordId))
    return (
      <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.addPage.types.medication}`}>
        <EditCourseScreen key={recordId} petId={id} petName={pet.name} courseId={recordId} />
      </CabinetShell>
    )
  }

  if (record.kind === 'visit') {
    if (!MEDICAL_RECORD_STAGE.visits) notFound()
    // A visit that happened is history: its old edit address shows the visit.
    if (record.status === 'done') redirect(medicalRecordHref.recordView(id, recordId))
    return (
      <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.recordKinds.visit}`}>
        <EditVisitScreen key={recordId} petId={id} petName={pet.name} visitId={recordId} />
      </CabinetShell>
    )
  }

  if (!recordKindOpen(record.kind)) notFound()
  if (record.status === 'done') redirect(medicalRecordHref.recordView(id, recordId))

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.recordKinds[record.kind]}`}>
      <EditEventScreen key={recordId} petId={id} petName={pet.name} species={pet.species} eventId={recordId} kind={record.kind} />
    </CabinetShell>
  )
}
