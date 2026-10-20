import CabinetShell from '@/components/cabinet/CabinetShell'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import FirstSteps from '@/features/pets/FirstSteps'
import { getOwnerToday } from '@/server/i18n/get-time-zone'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.firstSteps.title)

/** «Прививки и врач» (design `first-steps`): optional, after a pet added the ordinary way. */
export default async function FirstStepsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cabinet, pet, dict } = await openPetPage(id, `/pets/${id}/first-steps`)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.pets.listTitle} / ${pet.name}`}>
      <FirstSteps
        key={id}
        petId={id}
        petName={pet.name}
        species={pet.species}
        vaccinated={pet.vaccinated}
        today={await getOwnerToday()}
      />
    </CabinetShell>
  )
}
