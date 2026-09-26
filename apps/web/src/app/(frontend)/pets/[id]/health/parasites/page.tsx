import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { MEDICAL_RECORD_STAGE } from '@/features/medical-record/stage'
import EventsScreen from '@/features/medical-record/events/EventsScreen'
import { parseEventSaved } from '@/features/medical-record/events/event-view'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.eventsPage.parasite.title)

/**
 * The parasite treatments of a pet's record. A static route beside
 * `health/[recordId]`, so the section's name can never be read as a record.
 */
export default async function ParasitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  if (!MEDICAL_RECORD_STAGE.parasites) notFound()
  const { cabinet, dict } = await openPetPage(id, `/pets/${id}/health/parasites`)
  const saved = parseEventSaved((await searchParams).saved)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.medicalRecord.title} / ${dict.medicalRecord.eventsPage.parasite.title}`}>
      <EventsScreen key={id} petId={id} kind="parasite" saved={saved} />
    </CabinetShell>
  )
}
