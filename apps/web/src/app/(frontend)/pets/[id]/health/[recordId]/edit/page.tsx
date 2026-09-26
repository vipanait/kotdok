import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { MEDICAL_RECORD_STAGE } from '@/features/medical-record/stage'
import { EditWeightScreen } from '@/features/medical-record/weight/WeightFormScreen'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { createServiceClient } from '@/server/supabase/server'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.weightForm.editTitle)

/**
 * Correcting one saved record. The record is looked up for this pet and
 * this owner before anything is drawn: someone else's measurement, one of
 * another pet and a deleted one are a 404, like someone else's pet.
 */
export default async function EditHealthRecordPage({ params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params
  const { cabinet, pet, dict } = await openPetPage(id, `/pets/${id}/health/${recordId}/edit`)
  const kind = await findHealthRecord(createServiceClient(), cabinet.user.id, id, recordId)
  if (kind !== 'weight' || !MEDICAL_RECORD_STAGE.weight) notFound()

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.weightPage.title}`}>
      <EditWeightScreen key={recordId} petId={id} petName={pet.name} weightId={recordId} />
    </CabinetShell>
  )
}
