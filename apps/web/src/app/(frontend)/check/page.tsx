import Link from 'next/link'
import CabinetShell from '@/components/cabinet/CabinetShell'
import Illustration from '@/components/ui/Illustration'
import CheckForm from '@/features/symptom-check/CheckForm'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { loadCheckPets } from '@/server/checks/load-check-pages'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.check.pageTitle)

export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ pet?: string | string[] }>
}) {
  const cabinet = await requireCabinet('/login?next=/check')

  const [{ pet: petParam }, pets, locale] = await Promise.all([
    searchParams,
    loadCheckPets(cabinet.user.id),
    getLocale(),
  ])
  const dict = await getDictionary(locale)
  const t = dict.check

  // `?pet=` preselects only one of the owner's own pets.
  const requested = typeof petParam === 'string' ? petParam : undefined
  const initialPet = pets.find(pet => pet.id === requested) ?? pets[0]

  return (
    <CabinetShell cabinet={cabinet} active="check" crumb={t.crumb}>
      {initialPet ? (
        <CheckForm key={initialPet.id} pets={pets} initialPetId={initialPet.id} credits={cabinet.credits} />
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
