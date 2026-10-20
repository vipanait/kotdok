import CabinetShell from '@/components/cabinet/CabinetShell'
import PetPageHead from '@/features/pets/PetPageHead'
import PetForm from '@/features/pets/PetForm'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { newPetHref, parseGoal } from '@/features/onboarding/onboarding-state'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { getOnboarding } from '@/server/onboarding/get-onboarding'
import { listPets } from '@/server/pets/pet-service'
import { createServiceClient } from '@/server/supabase/server'

export const generateMetadata = privatePageMetadata(d => d.pets.newPageTitle)

export default async function NewPetPage({
  searchParams,
}: {
  searchParams: Promise<{ goal?: string | string[] }>
}) {
  // The path chosen at the first entry rides in the address through sign-in
  // and a reload; read strictly, it is only ever one of the two paths.
  const asked = parseGoal((await searchParams).goal)
  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(newPetHref(asked))}`)
  // Without one in the address, a path this account began and did not finish
  // goes on — while it still has no pet (one added on the phone ends it).
  const goal = asked ?? (await storedGoal(cabinet.user.id))

  const dict = await getDictionary(await getLocale())
  const t = dict.pets

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${t.listTitle} / ${t.newPageTitle}`}>
      <PetPageHead title={t.newPageTitle} subtitle={t.newSubtitle} backLabel={t.listTitle} />
      <PetForm onboarding={{ userId: cabinet.user.id, goal }} />
    </CabinetShell>
  )
}

async function storedGoal(userId: string) {
  const { goal } = await getOnboarding(userId)
  if (!goal) return null
  const pets = await listPets(createServiceClient(), userId)
  return pets.ok && pets.data.length === 0 ? goal : null
}
