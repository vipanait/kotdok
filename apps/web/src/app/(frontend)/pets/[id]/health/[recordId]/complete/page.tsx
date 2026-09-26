import { notFound, redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import CompleteScreen from '@/features/medical-record/events/CompleteScreen'
import { completeOpen, medicalRecordHref, parseCompleteFrom } from '@/features/medical-record/stage'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { createServiceClient } from '@/server/supabase/server'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.completeForm.title)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * «Сделано» on a plan: one of its items becomes a done record, the others
 * stay planned (`?item=` names it; without one, a plan of several asks).
 * The plan is looked up for this pet and this owner first — someone else's,
 * another pet's or a deleted one is a 404. Something already done has
 * nothing left to mark: its address shows the record.
 */
export default async function CompleteHealthRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; recordId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id, recordId } = await params
  const query = await searchParams
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/${recordId}/complete`)
  const record = await findHealthRecord(createServiceClient(), cabinet.user.id, id, recordId)
  if (!record || record.kind === 'weight' || record.kind === 'visit' || !completeOpen(record.kind)) notFound()
  if (record.status === 'done') redirect(medicalRecordHref.recordView(id, recordId))

  const itemId = typeof query.item === 'string' && UUID.test(query.item) ? query.item : null
  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.recordKinds[record.kind]}`}>
      <CompleteScreen
        key={`${recordId}-${itemId ?? ''}`}
        petId={id}
        eventId={recordId}
        kind={record.kind}
        itemId={itemId}
        from={parseCompleteFrom(query.from)}
      />
    </CabinetShell>
  )
}
