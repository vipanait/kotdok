import { notFound } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import PetPageHead from '@/features/pets/PetPageHead'
import PetForm from '@/features/pets/PetForm'
import { medicalRecordHref } from '@/features/medical-record/stage'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { createServiceClient } from '@/server/supabase/server'
import type { Pet } from '@/shared/types'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.shell.pets)

export default async function EditPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(`/pets/${id}/edit`)}`)

  const service = createServiceClient()
  const [{ data: pet, error }, locale] = await Promise.all([
    service
      .from('pets')
      .select('*')
      .eq('id', id)
      .eq('user_id', cabinet.user.id)
      .is('deleted_at', null)
      .maybeSingle(),
    getLocale(),
  ])

  // A failed read is an error; a malformed id (22P02) is just another missing pet.
  if (error && error.code !== '22P02') throw new Error(`Could not load the pet: ${error.message}`)
  // Someone else's pet, a deleted one and a malformed id all look the same.
  if (!pet) notFound()

  const dict = await getDictionary(locale)
  const t = dict.pets
  const { name } = pet as Pet

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${t.listTitle} / ${name}`}>
      <PetPageHead
        title={name}
        subtitle={t.editSubtitle}
        backLabel={dict.medicalRecord.title}
        backHref={medicalRecordHref.record(id)}
      />
      <PetForm pet={pet as Pet} />
    </CabinetShell>
  )
}
