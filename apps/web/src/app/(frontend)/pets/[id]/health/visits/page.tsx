import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { MEDICAL_RECORD_STAGE } from '@/features/medical-record/stage'
import VisitsScreen from '@/features/medical-record/visits/VisitsScreen'
import { parseVisitSaved } from '@/features/medical-record/visits/visit-view'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.visitsPage.title)

/**
 * The vet visits of a pet's record. A static route beside
 * `health/[recordId]`, so the section's name can never be read as a record.
 */
export default async function VisitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  if (!MEDICAL_RECORD_STAGE.visits) notFound()
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/visits`)
  const saved = parseVisitSaved((await searchParams).saved)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.visitsPage.title}`}>
      <VisitsScreen key={id} petId={id} saved={saved} />
    </CabinetShell>
  )
}
