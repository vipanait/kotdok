import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { MEDICAL_RECORD_STAGE } from '@/features/medical-record/stage'
import CoursesScreen from '@/features/medical-record/medications/CoursesScreen'
import { parseCourseSaved } from '@/features/medical-record/medications/course-view'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.coursesPage.title)

/**
 * The medication courses of a pet's record. A static route beside
 * `health/[recordId]`, so the section's name can never be read as a record.
 */
export default async function MedicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  if (!MEDICAL_RECORD_STAGE.medications) notFound()
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/medications`)
  const saved = parseCourseSaved((await searchParams).saved)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.coursesPage.title}`}>
      <CoursesScreen key={id} petId={id} saved={saved} />
    </CabinetShell>
  )
}
