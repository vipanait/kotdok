import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import Icon from '@/components/ui/Icon'
import PetCard from '@/features/pets/PetCard'
import PetSavedBanner, { parsePetSaved } from '@/features/pets/PetSavedBanner'
import PetsEmptyCard from '@/features/pets/PetsEmptyCard'
import { loadCabinetUser } from '@/server/cabinet/load-cabinet'
import { loadPetsOverview } from '@/server/dashboard/load-dashboard'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PetsPage({
  searchParams,
}: {
  searchParams: Promise<{ petSaved?: string | string[] }>
}) {
  const cabinet = await loadCabinetUser()
  if (!cabinet) redirect('/login?next=/pets')

  const [{ pets, latestChecksByPet }, params, locale] = await Promise.all([
    loadPetsOverview(cabinet.user.id),
    searchParams,
    getLocale(),
  ])
  const dict = await getDictionary(locale)
  const t = dict.pets
  const petSaved = parsePetSaved(params.petSaved)

  return (
    <CabinetShell cabinet={cabinet} active="pets" crumb={`${dict.shell.account} / ${t.listTitle}`}>
      {petSaved && <PetSavedBanner kind={petSaved} dict={dict} canCheck={cabinet.credits > 0} />}

      <div className="pagehead">
        <div>
          <h1>{t.listTitle}</h1>
          <p>{t.listSubtitle}</p>
        </div>
        {pets.length > 0 && (
          <Link href="/pets/new" className="btn primary">
            <Icon name="plus" />
            {dict.dashboard.addPetBtn}
          </Link>
        )}
      </div>

      {pets.length ? (
        <div className="grid2">
          {pets.map(pet => (
            <PetCard
              key={pet.id}
              pet={pet}
              latestCheck={latestChecksByPet[pet.id]}
              dict={dict}
              locale={locale}
            />
          ))}
        </div>
      ) : (
        <PetsEmptyCard dict={dict} />
      )}
    </CabinetShell>
  )
}
