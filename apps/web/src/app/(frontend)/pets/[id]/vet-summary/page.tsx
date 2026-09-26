import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { MEDICAL_RECORD_STAGE, medicalRecordHref } from '@/features/medical-record/stage'
import VetSummaryScreen from '@/features/medical-record/summary/VetSummaryScreen'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.vetSummary.title)

/**
 * «Для врача» (spec §7.17, §9): the summary of one pet's record, to show
 * and to print. The page is its own print view — there is no second URL —
 * so the gate is one: someone else's pet, a deleted one and a malformed id
 * are a 404 here, before anything is drawn, and the API behind it answers
 * 404 as well.
 */
export default async function VetSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!MEDICAL_RECORD_STAGE.vetSummary) notFound()
  const { cabinet, dict } = await openPetPage(id, medicalRecordHref.vetSummary(id))

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.vetSummary.title}`}>
      <VetSummaryScreen key={id} petId={id} />
    </CabinetShell>
  )
}
