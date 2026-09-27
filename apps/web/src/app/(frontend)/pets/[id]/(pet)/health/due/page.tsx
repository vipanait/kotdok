import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import DueScreen from '@/features/medical-record/DueScreen'
import { MEDICAL_RECORD_STAGE, parseSavedRecord } from '@/features/medical-record/stage'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.due.pageTitle)

/**
 * «Все сроки» of one pet (web v1 «due»). A static route beside
 * `health/[recordId]`, like the sections, so `due` is never read as a record.
 */
export default async function DuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  if (!MEDICAL_RECORD_STAGE.due) notFound()
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/due`)
  const query = await searchParams
  const saved = query.saved === 'completed'
  // The record «Сделано» made, opened from its notice (MW-09).
  const savedRecord = parseSavedRecord(query.record)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.due.pageTitle}`}>
      <DueScreen key={id} petId={id} saved={saved} savedRecord={savedRecord} />
    </CabinetShell>
  )
}
