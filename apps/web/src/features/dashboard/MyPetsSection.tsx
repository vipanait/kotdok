import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import PetCard from '@/features/pets/PetCard'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { Pet, PetLatestCheck } from '@/shared/types'

/**
 * "Ваши питомцы · N" on the overview: the count, the way to add one more and
 * a card per pet. Under 760px the head stacks — title and count, then the
 * link — and the count never breaks away from its dot.
 */
export default function MyPetsSection({
  pets,
  latestChecksByPet,
  dict,
  locale,
}: {
  pets: Pet[]
  latestChecksByPet: Record<string, PetLatestCheck>
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.dashboard
  return (
    <section aria-labelledby="my-pets-title">
      <div className="section-head section-head-action">
        <h2 id="my-pets-title">
          {t.petsHeading}
          <span className="muted nowrap">{' · '}{pets.length}</span>
        </h2>
        <Link href="/pets/new" className="link">
          <Icon name="plus" />
          {t.addPetBtn}
        </Link>
      </div>
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
    </section>
  )
}
