import CabinetShell from '@/components/cabinet/CabinetShell'
import PetAvatar from '@/components/PetAvatar'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import FirstRecord from '@/features/onboarding/FirstRecord'
import { getOwnerToday } from '@/server/i18n/get-time-zone'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { getHealthOverview } from '@/server/medical-record/overview-service'
import { signAvatars } from '@/server/pets/avatar-service'
import { createServiceClient } from '@/server/supabase/server'

export const generateMetadata = privatePageMetadata(d => d.onboarding.firstRecordTitle)

/**
 * «Добавим первую запись?» (design `first-record`): the health path's step
 * after the pet is saved. The gate is the pet's own (`openPetPage`); what
 * may be added is the server's word (`writable`).
 */
export default async function FirstRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cabinet, pet, dict } = await openPetPage(id, `/pets/${id}/first-record`)
  const service = createServiceClient()
  const [overview, [photoUrl]] = await Promise.all([
    getHealthOverview(service, cabinet.user.id, id, await getOwnerToday()),
    signAvatars(service, [pet.avatar_path ?? null]),
  ])
  // A record that cannot be read offers the three records anyway: each form checks for itself.
  const writable = overview.ok ? overview.data.writable : (['vaccinations', 'parasites', 'visits'] as const)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.pets.listTitle} / ${pet.name}`}>
      <FirstRecord
        petId={id}
        petName={pet.name}
        avatar={<PetAvatar size={100} species={pet.species} photoUrl={photoUrl} />}
        writable={writable}
        dict={dict}
      />
    </CabinetShell>
  )
}
