import Link from 'next/link'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import { profileCompleteness } from '@/features/pets/pet-profile'
import { intlLocale, type Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { Pet, PetLatestCheck } from '@/shared/types'
import { petSummary } from '@/shared/utils/pet-summary'
import { isUrgencyKey } from '@/shared/utils/urgency'

/**
 * A pet on the overview and on `/pets`: who it is, how its last check came
 * out and how much of its profile is filled in. The whole card opens the
 * profile. Takes the dictionary so server pages can render it directly.
 */
export default function PetCard({
  pet,
  latestCheck,
  dict,
  locale,
  timeZone,
  headingLevel: Heading = 'h2',
}: {
  pet: Pet
  latestCheck?: PetLatestCheck
  dict: Dictionary
  locale: Locale
  timeZone: string
  /** `h3` where the cards sit under a section heading, as on the overview. */
  headingLevel?: 'h2' | 'h3'
}) {
  const t = dict.pets
  const species = pet.species === 'dog' ? t.speciesDog : t.speciesCat
  const meta = petSummary(pet, dict, locale) || species

  const completeness = profileCompleteness(pet)
  const checkDate = latestCheck
    ? new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', timeZone })
      .format(new Date(latestCheck.created_at))
    : null

  return (
    <Link href={`/pets/${pet.id}/edit`} className="card pet-card">
      <span className="arrow"><Icon name="arrow" /></span>
      <div className="row">
        <PetAvatar species={pet.species} />
        <div className="pet-card-title">
          <Heading className="pet-card-name">{pet.name}</Heading>
          <p>{meta}</p>
        </div>
      </div>

      {latestCheck ? (
        <>
          <p>{t.lastCheck} · {checkDate}</p>
          {isUrgencyKey(latestCheck.urgency) && <UrgencyBadge urgency={latestCheck.urgency} dict={dict} />}
        </>
      ) : (
        <p>{t.lastCheckNever}</p>
      )}

      {/* The bar is for the eye; the line under it says the same in words. */}
      <div className="progress" aria-hidden>
        <span style={{ width: `${completeness}%` }} />
      </div>
      <p className="pet-card-profile">{completeness === 100 ? t.profileComplete : t.profileIncomplete}</p>
    </Link>
  )
}
