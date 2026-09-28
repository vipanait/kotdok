import Link from 'next/link'
import CabinetShell from '@/components/cabinet/CabinetShell'
import Icon from '@/components/ui/Icon'
import PetRows from '@/features/pets/PetRows'
import PetSavedBanner from '@/features/pets/PetSavedBanner'
import { parsePetSaved } from '@/features/pets/pet-saved'
import PetsEmptyCard from '@/features/pets/PetsEmptyCard'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import { loadPetsOverview } from '@/server/dashboard/load-dashboard'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import { getTimeZone } from '@/server/i18n/get-time-zone'
import { dayInZone } from '@/shared/i18n/time-zone'

export const generateMetadata = privatePageMetadata(d => d.shell.pets)

export default async function PetsPage({
  searchParams,
}: {
  searchParams: Promise<{ petSaved?: string | string[] }>
}) {
  const cabinet = await requireCabinet('/login?next=/pets')

  // The owner's day, not the server's: "overdue" and "in 5 days" turn at their midnight.
  const today = dayInZone(new Date(), await getTimeZone())
  const [{ pets, latestChecksByPet, dueByPet }, params, locale] = await Promise.all([
    loadPetsOverview(cabinet.user.id, today),
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
          <h1>
            {t.listTitle}
            {pets.length > 0 && <span className="muted nowrap">{' · '}{pets.length}</span>}
          </h1>
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
        <section className="card pet-directory" aria-label={t.listTitle}>
          <PetRows
            pets={pets}
            latestChecksByPet={latestChecksByPet}
            dueByPet={dueByPet}
            today={today}
            dict={dict}
            locale={locale}
          />
        </section>
      ) : (
        <PetsEmptyCard dict={dict} />
      )}
    </CabinetShell>
  )
}
