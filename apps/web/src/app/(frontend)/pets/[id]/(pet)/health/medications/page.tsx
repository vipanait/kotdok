import CabinetShell from '@/components/cabinet/CabinetShell'
import { parseSavedRecord } from '@/features/medical-record/routes'
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
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/medications`)
  const query = await searchParams
  const saved = parseCourseSaved(query.saved)
  // The record a save made, opened from its notice (MW-09).
  const savedRecord = parseSavedRecord(query.record)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.coursesPage.title}`}>
      <CoursesScreen key={id} petId={id} saved={saved} savedRecord={savedRecord} />
    </CabinetShell>
  )
}
