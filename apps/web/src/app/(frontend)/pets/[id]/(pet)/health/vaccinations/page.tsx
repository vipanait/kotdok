import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { MEDICAL_RECORD_STAGE } from '@/features/medical-record/stage'
import EventsScreen from '@/features/medical-record/events/EventsScreen'
import { parseEventSaved } from '@/features/medical-record/events/event-view'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.eventsPage.vaccination.title)

/**
 * The vaccinations of a pet's record. A static route beside
 * `health/[recordId]`, so the section's name can never be read as a record.
 */
export default async function VaccinationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  if (!MEDICAL_RECORD_STAGE.vaccinations) notFound()
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/vaccinations`)
  const saved = parseEventSaved((await searchParams).saved)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.eventsPage.vaccination.title}`}>
      <EventsScreen key={id} petId={id} kind="vaccination" saved={saved} />
    </CabinetShell>
  )
}
