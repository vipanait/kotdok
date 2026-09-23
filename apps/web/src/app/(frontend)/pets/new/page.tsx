import { redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import PetPageHead from '@/features/pets/PetPageHead'
import PetForm from '@/features/pets/PetForm'
import { loadCabinetUser } from '@/server/cabinet/load-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.pets.newPageTitle)

export default async function NewPetPage() {
  const cabinet = await loadCabinetUser()
  if (!cabinet) redirect('/login?next=/pets/new')

  const dict = await getDictionary(await getLocale())
  const t = dict.pets

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${t.listTitle} / ${t.newPageTitle}`}>
      <PetPageHead title={t.newPageTitle} subtitle={t.newSubtitle} backLabel={t.listTitle} />
      <PetForm />
    </CabinetShell>
  )
}
