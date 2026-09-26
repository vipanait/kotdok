import CabinetShell from '@/components/cabinet/CabinetShell'
import MedicalRecordScreen from '@/features/medical-record/MedicalRecordScreen'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { parseRecordSaved } from '@/features/pets/pet-form-exit'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.title)

/**
 * The medical record of one pet. The page checks the pet is the caller's —
 * someone else's pet, a deleted one and a malformed id are all a 404, before
 * anything is drawn — and names it in the frame. The record itself is read
 * in the browser through the v1 API, the same data the app shows.
 * `?saved=form`: back from the pet form after a save, confirmed once.
 */
export default async function MedicalRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const { cabinet, pet, dict } = await openPetPage(id, `/pets/${id}`)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.pets.listTitle} / ${pet.name}`}>
      {/* A new pet is a new screen: nothing of the previous one's state carries over. */}
      <MedicalRecordScreen key={id} petId={id} formSaved={parseRecordSaved(query.saved)} />
    </CabinetShell>
  )
}
