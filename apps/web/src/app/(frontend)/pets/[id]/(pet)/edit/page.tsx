import CabinetShell from '@/components/cabinet/CabinetShell'
import PetPageHead from '@/features/pets/PetPageHead'
import PetForm, { type PetFormHintTexts } from '@/features/pets/PetForm'
import { medicalRecordHref } from '@/features/medical-record/routes'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { getLocale } from '@/server/i18n/get-locale'
import { getOwnerToday } from '@/server/i18n/get-time-zone'
import { getHealthOverview } from '@/server/medical-record/overview-service'
import { createServiceClient } from '@/server/supabase/server'
import { formatCount } from '@/shared/i18n/plural'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { UuidSchema, type HealthOverview } from '@lapka/contracts'
import { petFormHints } from '@lapka/shared'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.shell.pets)

/**
 * The pet's record as the form wants it: read beside the gate, not after it,
 * with the caller's session (the layout already read it once this request).
 * Only for a well-formed id — a malformed one is the gate's 404 — and a pet
 * that is not the caller's is not found here either, so nothing is read for
 * someone else's pet. Null when the record could not be read.
 */
async function readRecordForForm(petId: string, path: string): Promise<HealthOverview | null> {
  if (!UuidSchema.safeParse(petId).success) return null
  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(path)}`)
  const overview = await getHealthOverview(createServiceClient(), cabinet.user.id, petId, await getOwnerToday())
  if (overview.ok) return overview.data
  // Someone else's or a deleted pet: the gate answers 404; nothing to report.
  if (overview.reason !== 'not_found') {
    console.error('[pets] the form notes are left out: the record could not be read', overview.reason, overview.message)
  }
  return null
}

/**
 * The notes under the weight, vaccination and medicines fields (spec §4):
 * where the record already says more than the form. Worked out by the rule
 * the phone uses (`petFormHints`). They are a pointer, not the form: a record
 * that cannot be read leaves the form without them rather than without a page.
 */
function formHints(overview: HealthOverview | null, dict: Dictionary, locale: Locale): PetFormHintTexts {
  if (!overview) return {}
  const hints = petFormHints(overview)
  const words = dict.pets.recordHints
  return {
    weight: hints.weight ? words.weight : undefined,
    vaccinated: hints.vaccinations > 0 ? formatCount(words.vaccinations, hints.vaccinations, locale) : undefined,
    medications: hints.medications ? words.medications : undefined,
  }
}

export default async function EditPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/pets/${id}/edit`
  // The same gate as every page of the pet (it already ran in the layout),
  // and the record for the form's notes read at the same time.
  const [{ cabinet, pet, dict }, locale, overview] = await Promise.all([openPetPage(id, path), getLocale(), readRecordForForm(id, path)])
  const t = dict.pets
  // The form's list of medicines as the record has it on the owner's day
  // (MW-09: the courses current today, as the phone's form opens with); the
  // stored list when the record could not be read.
  const medications = overview?.pet.medications ?? null

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${t.listTitle} / ${pet.name}`}>
      <PetPageHead
        title={pet.name}
        subtitle={t.editSubtitle}
        backLabel={dict.medicalRecord.title}
        backHref={medicalRecordHref.record(id)}
      />
      <PetForm pet={medications ? { ...pet, medications } : pet} hints={formHints(overview, dict, locale)} />
    </CabinetShell>
  )
}
