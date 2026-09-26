import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import Illustration from '@/components/ui/Illustration'
import { medicalRecordHref } from '@/features/medical-record/stage'
import { petDueLine } from '@/features/medical-record/view-model'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { Pet, PetLatestCheck } from '@/shared/types'
import type { DueItem } from '@lapka/contracts'
import { petSummary } from '@/shared/utils/pet-summary'
import { isUrgencyKey } from '@/shared/utils/urgency'

/**
 * Pets as compact rows — the overview's first three and the full list on
 * `/pets`, so the page keeps its shape however many pets there are. Each row
 * opens that pet's medical record; the profile form is one step further.
 *
 * Under the name, the pet's nearest due date when it is overdue or within
 * two weeks (spec §7.1), one line cut with an ellipsis; it is part of the
 * row's link, so it leads to that pet. The web has no notifications: this
 * line and the record's «Сроки» are the reminders (spec §9).
 *
 * The badge is the outcome of the pet's last saved check, labelled as such:
 * a past result, not how the pet is now. Rows keep the order they come in
 * and are never sorted by it.
 */
export default function PetRows({
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
  /** The owner's calendar day. */
  today: string
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.pets
  return (
    <ul className="compact-pets">
      {pets.map(pet => {
        const latest = latestChecksByPet[pet.id]
        const meta = petSummary(pet, dict, locale) || (pet.species === 'dog' ? t.speciesDog : t.speciesCat)
        const due = dueByPet[pet.id] ? petDueLine(dict, locale, dueByPet[pet.id], today) : null
        return (
          <li key={pet.id}>
            <Link href={medicalRecordHref.record(pet.id)} className="compact-pet">
              {/* 48px, 42px on phones: sized by CSS, so no fixed box here. */}
              <Illustration name={pet.species === 'dog' ? 'avatar-dog' : 'avatar-cat'} size={48} className="avatar" />
              <div className="compact-pet-copy">
                <h3>{pet.name}</h3>
                <p>{meta}</p>
                {due && <p className={`compact-pet-due ${due.tone}`}>{due.text}</p>}
                <div className="compact-pet-status">
                  <span>{t.lastCheckLabel}</span>
                  {latest && isUrgencyKey(latest.urgency)
                    ? <UrgencyBadge urgency={latest.urgency} dict={dict} />
                    : <span>{t.lastCheckNone}</span>}
                </div>
              </div>
              <Icon name="arrow" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
