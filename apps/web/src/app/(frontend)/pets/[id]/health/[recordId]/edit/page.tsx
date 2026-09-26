import { notFound, redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { EditEventScreen } from '@/features/medical-record/events/EventFormScreen'
import { MEDICAL_RECORD_STAGE, medicalRecordHref, recordKindOpen } from '@/features/medical-record/stage'
import { EditWeightScreen } from '@/features/medical-record/weight/WeightFormScreen'
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
 * Only what can change gets a form: a weighing, or a plan. A done
 * vaccination is history (owner rule of 26 September 2026) — its old edit
 * address shows the record itself, never a form; the server refuses the
 * change anyway (`record_done`).
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

  if (record.kind === 'visit' || !recordKindOpen(record.kind)) notFound()
  if (record.status === 'done') redirect(medicalRecordHref.recordView(id, recordId))

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.recordKinds[record.kind]}`}>
      <EditEventScreen key={recordId} petId={id} petName={pet.name} species={pet.species} eventId={recordId} kind={record.kind} />
    </CabinetShell>
  )
}
