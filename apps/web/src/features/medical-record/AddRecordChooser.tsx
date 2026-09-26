import Link from 'next/link'
import Icon, { type IconName } from '@/components/ui/Icon'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { medicalRecordHref, type RecordType } from './stage'

const TYPE_ICON: Record<RecordType, IconName> = {
  vaccination: 'vaccine',
  parasite: 'parasite',
  visit: 'visit',
  medication: 'medicine',
  weight: 'chart',
}

/**
 * «Что добавить?» (web v1, «add»): the record types whose forms are built,
 * in the chooser's order. A type whose stage is not done is not listed —
 * never a link to a form that is not there.
 */
export default function AddRecordChooser({
  petId,
  petName,
  types,
  dict,
}: {
  petId: string
  petName: string
  types: readonly RecordType[]
  dict: Dictionary
}) {
  const words = dict.medicalRecord.addPage
  return (
    <div className="health-page">
      <div className="pagehead">
        <div>
          <h1>{words.title}</h1>
          <p>{petName}</p>
        </div>
        <Link href={medicalRecordHref.record(petId)} className="link">
          <Icon name="back" />
          {words.back}
        </Link>
      </div>
      <nav className="card record-form record-chooser" aria-label={words.title}>
        <ul className="record-lines">
          {types.map((type) => (
            <li key={type} className="record-line">
              <Link href={medicalRecordHref.newRecord(petId, type)} className="link">
                <Icon name={TYPE_ICON[type]} />
                {words.types[type]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
