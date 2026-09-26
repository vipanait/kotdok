import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { MEDICAL_RECORD_STAGE } from '@/features/medical-record/stage'
import WeightScreen from '@/features/medical-record/weight/WeightScreen'
import { parseWeightSaved } from '@/features/medical-record/weight/weight-view'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.weightPage.title)

/**
 * The weight section of a pet's record. A static route beside
 * `health/[recordId]`, so the section's name can never be read as a record.
 */
export default async function WeightPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  if (!MEDICAL_RECORD_STAGE.weight) notFound()
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/weight`)
  const saved = parseWeightSaved((await searchParams).saved)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.weightPage.title}`}>
      <WeightScreen key={id} petId={id} saved={saved} />
    </CabinetShell>
  )
}
