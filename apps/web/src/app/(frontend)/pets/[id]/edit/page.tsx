import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import PetPageHead from '@/features/pets/PetPageHead'
import PetForm from '@/features/pets/PetForm'
import { loadCabinetUser } from '@/server/cabinet/load-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { createServiceClient } from '@/server/supabase/server'
import type { Pet } from '@/shared/types'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function EditPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const cabinet = await loadCabinetUser()
  if (!cabinet) redirect(`/login?next=${encodeURIComponent(`/pets/${id}/edit`)}`)

  const service = createServiceClient()
  const [{ data: pet }, locale] = await Promise.all([
    service
      .from('pets')
      .select('*')
      .eq('id', id)
      .eq('user_id', cabinet.user.id)
      .is('deleted_at', null)
      .maybeSingle(),
    getLocale(),
  ])

  // Someone else's pet, a deleted one and a malformed id all look the same.
  if (!pet) notFound()

  const dict = await getDictionary(locale)
  const t = dict.pets
  const { name } = pet as Pet

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${t.listTitle} / ${name}`}>
      <PetPageHead title={name} subtitle={t.editSubtitle} backLabel={t.listTitle} />
      <PetForm pet={pet as Pet} />
    </CabinetShell>
  )
}
