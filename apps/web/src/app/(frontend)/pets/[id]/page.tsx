import { notFound, redirect } from 'next/navigation'
import { UuidSchema } from '@lapka/contracts'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import MedicalRecordScreen from '@/features/medical-record/MedicalRecordScreen'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { getPet } from '@/server/pets/pet-service'
import { createServiceClient } from '@/server/supabase/server'

export const generateMetadata = privatePageMetadata(d => d.medicalRecord.title)

/**
 * The medical record of one pet. The page checks the pet is the caller's —
 * someone else's pet, a deleted one and a malformed id are all a 404, before
 * anything is drawn — and names it in the frame. The record itself is read
 * in the browser through the v1 API, the same data the app shows.
 */
export default async function MedicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(`/pets/${id}`)}`)
  if (!UuidSchema.safeParse(id).success) notFound()

  const [pet, locale] = await Promise.all([getPet(createServiceClient(), cabinet.user.id, id), getLocale()])
  if (!pet.ok) {
    if (pet.reason === 'not_found') notFound()
    if (pet.reason === 'account_deleting') redirect('/account-deletion')
    throw new Error(`Could not load the pet: ${pet.message ?? pet.reason}`)
  }

  const dict = await getDictionary(locale)
  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.pets.listTitle} / ${pet.data.name}`}>
      {/* A new pet is a new screen: nothing of the previous one's state carries over. */}
      <MedicalRecordScreen key={id} petId={id} />
    </CabinetShell>
  )
}
