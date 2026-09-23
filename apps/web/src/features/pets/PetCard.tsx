import Link from 'next/link'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import { formatPetAge, profileCompleteness } from '@/features/pets/pet-profile'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { Pet, PetLatestCheck } from '@/shared/types'
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
}: {
  pet: Pet
  latestCheck?: PetLatestCheck
  dict: Dictionary
  locale: Locale
  timeZone: string
}) {
  const t = dict.pets
  const species = pet.species === 'dog' ? t.speciesDog : t.speciesCat
  const meta = [
    pet.breed?.trim() || null,
    pet.age_years != null ? formatPetAge(pet.age_years, t.age, locale) : null,
  ].filter(Boolean).join(' · ') || species

  const completeness = profileCompleteness(pet)
  const checkDate = latestCheck
    ? new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', timeZone })
      .format(new Date(latestCheck.created_at))
    : null

  return (
    <Link href={`/pets/${pet.id}/edit`} className="card pet-card">
      <span className="arrow"><Icon name="arrow" /></span>
      <div className="row">
        <PetAvatar species={pet.species} />
        <div className="pet-card-title">
          <h2>{pet.name}</h2>
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

      <div
        className="progress"
        role="progressbar"
        aria-label={t.profileProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completeness}
      >
        <span style={{ width: `${completeness}%` }} />
      </div>
      <p className="pet-card-profile">{completeness === 100 ? t.profileComplete : t.profileIncomplete}</p>
    </Link>
  )
}
