import Link from 'next/link'
import Icon, { type IconName } from '@/components/ui/Icon'
import { medicalRecordHref, sectionOpen, RECORD_TYPE_SECTION } from '@/features/medical-record/routes'
import type { HealthSection } from '@lapka/contracts'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/** The three records a new health record starts with (design `first-record`). */
const FIRST_RECORDS = [
  { type: 'vaccination', icon: 'vaccine' },
  { type: 'parasite', icon: 'parasite' },
  { type: 'visit', icon: 'visit' },
] as const satisfies readonly { type: keyof typeof RECORD_TYPE_SECTION; icon: IconName }[]

/**
 * «Карточка создана · Добавим первую запись?» — the health path's step once
 * the pet is saved. Each card opens the real form of that record type; one
 * the server does not store yet (`writable`) is not offered. «Добавлю
 * позже» goes to the pet's record. Nothing here is required.
 */
export default function FirstRecord({
  petId,
  petName,
  avatar,
  writable,
  dict,
}: {
  petId: string
  petName: string
  /** The pet's photo or its species drawing. */
  avatar: React.ReactNode
  writable: readonly HealthSection[]
  dict: Dictionary
}) {
  const t = dict.onboarding
  const cards = FIRST_RECORDS.filter(({ type }) => sectionOpen(RECORD_TYPE_SECTION[type], writable))
  const texts = {
    vaccination: [t.vaccination, t.vaccinationBody],
    parasite: [t.parasite, t.parasiteBody],
    visit: [t.visit, t.visitBody],
  } as const

  return (
    <div className="first-record">
      <div className="first-record-head">
        {avatar}
        <p className="first-record-created">
          <Icon name="done" />
          {t.created.replace('{name}', () => petName)}
        </p>
        <h1>{t.firstRecordTitle}</h1>
        <p>{t.firstRecordBody}</p>
      </div>

      {cards.length > 0 && (
        <ul className="first-record-cards">
          {cards.map(({ type, icon }) => {
            const [title, body] = texts[type]
            return (
              <li key={type} className="card">
                <span className="first-record-icon" aria-hidden>
                  <Icon name={icon} />
                </span>
                <h2>{title}</h2>
                <p>{body}</p>
                <Link
                  href={medicalRecordHref.newRecord(petId, type)}
                  className="btn secondary"
                  aria-label={t.addLabel.replace('{what}', title)}
                >
                  {t.add}
                  <Icon name="plus" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <p className="first-record-later">
        <Link href={medicalRecordHref.record(petId)} className="link">
          {t.later}
        </Link>
      </p>
    </div>
  )
}
