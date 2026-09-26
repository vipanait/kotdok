import CabinetShell from '@/components/cabinet/CabinetShell'
import MedicalRecordScreen from '@/features/medical-record/MedicalRecordScreen'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.title)

/**
 * The medical record of one pet. The page checks the pet is the caller's —
 * someone else's pet, a deleted one and a malformed id are all a 404, before
 * anything is drawn — and names it in the frame. The record itself is read
 * in the browser through the v1 API, the same data the app shows.
 */
export default async function MedicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cabinet, pet, dict } = await openPetPage(id, `/pets/${id}`)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.pets.listTitle} / ${pet.name}`}>
      {/* A new pet is a new screen: nothing of the previous one's state carries over. */}
      <MedicalRecordScreen key={id} petId={id} />
    </CabinetShell>
  )
}
