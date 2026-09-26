import { notFound, redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import EventRecordScreen from '@/features/medical-record/events/EventRecordScreen'
import CourseScreen from '@/features/medical-record/medications/CourseScreen'
import { parseCourseSaved } from '@/features/medical-record/medications/course-view'
import { parseEventSaved } from '@/features/medical-record/events/event-view'
import { MEDICAL_RECORD_STAGE, medicalRecordHref, recordKindOpen } from '@/features/medical-record/stage'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { createServiceClient } from '@/server/supabase/server'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.title)

/**
 * One saved record. The id must be a UUID of a live record of this pet and
 * this owner; anything else — another owner's record, another pet's, a
 * deleted one, a section name misspelt — is a 404. Sections are static
 * routes beside this one and win over it.
 *
 * A weighing has no page of its own to read (web v1: the history lists
 * every value), so its address opens its form. A vaccination (MW-03) or a
 * treatment (MW-04) is read here, done or planned; a medication course
 * (MW-05), current or finished.
 */
export default async function HealthRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; recordId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id, recordId } = await params
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/${recordId}`)
  const record = await findHealthRecord(createServiceClient(), cabinet.user.id, id, recordId)

  if (record?.kind === 'weight' && MEDICAL_RECORD_STAGE.weight) redirect(medicalRecordHref.recordEdit(id, recordId))
  if (record?.kind === 'medication') {
    if (!MEDICAL_RECORD_STAGE.medications) notFound()
    return (
      <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.addPage.types.medication}`}>
        <CourseScreen key={recordId} petId={id} courseId={recordId} saved={parseCourseSaved((await searchParams).saved)} />
      </CabinetShell>
    )
  }
  if (!record || record.kind === 'weight' || record.kind === 'visit' || !recordKindOpen(record.kind)) notFound()

  const saved = parseEventSaved((await searchParams).saved)
  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.recordKinds[record.kind]}`}>
      <EventRecordScreen key={recordId} petId={id} eventId={recordId} kind={record.kind} saved={saved} />
    </CabinetShell>
  )
}
