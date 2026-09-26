import CabinetShell from '@/components/cabinet/CabinetShell'
import PetPageHead from '@/features/pets/PetPageHead'
import PetForm, { type PetFormHintTexts } from '@/features/pets/PetForm'
import { medicalRecordHref } from '@/features/medical-record/stage'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { getLocale } from '@/server/i18n/get-locale'
import { getHealthOverview } from '@/server/medical-record/overview-service'
import { createServiceClient } from '@/server/supabase/server'
import { formatCount } from '@/shared/i18n/plural'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { petFormHints } from '@lapka/shared'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.shell.pets)

/**
 * The notes under the weight, vaccination and medicines fields (spec §4):
 * where the record already says more than the form. Worked out by the rule
 * the phone uses (`petFormHints`). They are a pointer, not the form: a record
 * that cannot be read leaves the form without them rather than without a page.
 */
async function hintTexts(userId: string, petId: string, dict: Dictionary, locale: Locale): Promise<PetFormHintTexts> {
  const overview = await getHealthOverview(createServiceClient(), userId, petId)
  if (!overview.ok) {
    console.error('[pets] the form notes are left out: the record could not be read', overview.reason, overview.message)
    return {}
  }
  const hints = petFormHints(overview.data)
  const words = dict.pets.recordHints
  return {
    weight: hints.weight ? words.weight : undefined,
    vaccinated: hints.vaccinations > 0 ? formatCount(words.vaccinations, hints.vaccinations, locale) : undefined,
    medications: hints.medications ? words.medications : undefined,
  }
}

export default async function EditPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // The same gate as every page of the pet (it already ran in the layout).
  const [{ cabinet, pet, dict }, locale] = await Promise.all([openPetPage(id, `/pets/${id}/edit`), getLocale()])
  const hints = await hintTexts(cabinet.user.id, id, dict, locale)
  const t = dict.pets

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${t.listTitle} / ${pet.name}`}>
      <PetPageHead
        title={pet.name}
        subtitle={t.editSubtitle}
        backLabel={dict.medicalRecord.title}
        backHref={medicalRecordHref.record(id)}
      />
      <PetForm pet={pet} hints={hints} />
    </CabinetShell>
  )
}
