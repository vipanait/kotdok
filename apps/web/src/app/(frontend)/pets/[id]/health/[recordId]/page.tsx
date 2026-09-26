import { notFound, redirect } from 'next/navigation'
import { MEDICAL_RECORD_STAGE, medicalRecordHref } from '@/features/medical-record/stage'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { createServiceClient } from '@/server/supabase/server'

/**
 * One saved record. The id must be a UUID of a live record of this pet and
 * this owner; anything else — another owner's record, another pet's, a
 * deleted one, a section name misspelt — is a 404. Sections are static
 * routes beside this one and win over it.
 *
 * A weighing has no page of its own to read (web v1: the history lists
 * every value), so its address opens its form.
 */
export default async function HealthRecordPage({ params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params
  const { cabinet } = await openPetPage(id, `/pets/${id}/health/${recordId}`)
  const kind = await findHealthRecord(createServiceClient(), cabinet.user.id, id, recordId)

  if (kind === 'weight' && MEDICAL_RECORD_STAGE.weight) redirect(medicalRecordHref.recordEdit(id, recordId))
  notFound()
}
