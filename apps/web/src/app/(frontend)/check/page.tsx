import Link from 'next/link'
import CabinetShell from '@/components/cabinet/CabinetShell'
import Illustration from '@/components/ui/Illustration'
import CheckForm, { type RecheckContext } from '@/features/symptom-check/CheckForm'
import { UuidSchema } from '@lapka/contracts'
import { recheckPlaque } from '@/features/followup/followup-view'
import { loadFollowupCasePage } from '@/server/checks/load-followup-pages'
import { getTimeZone } from '@/server/i18n/get-time-zone'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { loadCheckPets } from '@/server/checks/load-check-pages'
import { loadPetPhotos } from '@/server/pets/pet-photos'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.check.pageTitle)

export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ pet?: string | string[]; case?: string | string[] }>
}) {
  const { pet: petParam, case: caseParam } = await searchParams
  const caseId = typeof caseParam === 'string' && UuidSchema.safeParse(caseParam).success ? caseParam : null
  const cabinet = await requireCabinet(
    `/login?next=${encodeURIComponent(caseId ? `/check?pet=${typeof petParam === 'string' ? petParam : ''}&case=${caseId}` : '/check')}`,
  )

  const [pets, locale, timeZone, photos, followupCase] = await Promise.all([
    loadCheckPets(cabinet.user.id),
    getLocale(),
    getTimeZone(),
    loadPetPhotos(cabinet.user.id),
    // `?case=`: a re-check with the previous one in mind — only the owner's own case.
    caseId ? loadFollowupCasePage(cabinet.user.id, caseId) : Promise.resolve(null),
  ])
  const dict = await getDictionary(locale)
  const t = dict.check

  // `?pet=` preselects only one of the owner's own pets; a case brings its own.
  const requested = typeof petParam === 'string' ? petParam : followupCase?.case.pet_id
  const initialPet = pets.find(pet => pet.id === requested) ?? pets[0]
  const recheck: RecheckContext | null =
    followupCase && pets.some(pet => pet.id === followupCase.case.pet_id)
      ? {
          caseId: followupCase.case.id,
          petId: followupCase.case.pet_id,
          label: recheckPlaque(dict.followup, followupCase.case, locale, timeZone),
        }
      : null

  return (
    <CabinetShell cabinet={cabinet} active="check" crumb={t.crumb}>
      {initialPet ? (
        <CheckForm
          key={`${initialPet.id}-${recheck?.caseId ?? ''}`}
          pets={pets}
          initialPetId={initialPet.id}
          credits={cabinet.credits}
          photos={photos}
          recheck={recheck}
        />
      ) : (
        // A check is always about a profile: without one there is nothing to send.
        <>
          <div className="pagehead">
            <div>
              <h1>{t.pageTitle}</h1>
            </div>
          </div>
          <section className="card empty">
            <Illustration name="welcome-pets" size={210} />
            <h2>{t.noPetsTitle}</h2>
            <p>{t.noPetsText}</p>
            <Link href="/pets/new" className="btn primary">{t.addPet}</Link>
          </section>
        </>
      )}
    </CabinetShell>
  )
}
