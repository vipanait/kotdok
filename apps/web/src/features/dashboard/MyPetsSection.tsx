import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import PetRows from '@/features/pets/PetRows'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { Pet, PetLatestCheck } from '@/shared/types'
import type { DueItem } from '@lapka/contracts'

/** How many pets the overview lists before "All pets · N". */
export const OVERVIEW_PET_LIMIT = 3

/**
 * "Ваши питомцы · N" on the overview: the first three pets in the list's own
 * order, each with its nearest due line, the way to add one more, and a link
 * to all of them. N counts every pet, not the rows shown, so five pets or
 * fifty keep the card the same size.
 */
export default function MyPetsSection({
  pets,
  latestChecksByPet,
  dueByPet,
  today,
  dict,
  locale,
}: {
  pets: Pet[]
  latestChecksByPet: Record<string, PetLatestCheck>
  dueByPet: Record<string, DueItem>
  today: string
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.dashboard
  return (
    <section className="card pets-summary" aria-labelledby="my-pets-title">
      <div className="section-head section-head-action">
        <h2 id="my-pets-title">
          {t.petsHeading}
          <span className="muted nowrap">{' · '}{pets.length}</span>
        </h2>
        <Link href="/pets/new" className="link">
          <Icon name="plus" />
          {t.addPetBtn}
        </Link>
      </div>
      <PetRows
        pets={pets.slice(0, OVERVIEW_PET_LIMIT)}
        latestChecksByPet={latestChecksByPet}
        dueByPet={dueByPet}
        today={today}
        dict={dict}
        locale={locale}
      />
      <div className="list-footer">
        <Link href="/pets" className="link">
          <span>{t.allPets.replace('{n}', String(pets.length))}</span>
          <Icon name="arrow" />
        </Link>
      </div>
    </section>
  )
}
