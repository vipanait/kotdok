import Link from 'next/link'
import Icon, { type IconName } from '@/components/ui/Icon'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { medicalRecordHref, type RecordType } from './routes'

const TYPE_ICON: Record<RecordType, IconName> = {
  vaccination: 'vaccine',
  parasite: 'parasite',
  visit: 'visit',
  medication: 'medicine',
  weight: 'chart',
}

/**
 * «Что добавить?» (web v1, «add»): the record types, in the chooser's order,
 * then «Документ» (DOC-1) — photos or a PDF kept with the pet, when the
 * page offers it (`documentHref`).
 */
export default function AddRecordChooser({
  petId,
  petName,
  types,
  documentHref = null,
  dict,
}: {
  petId: string
  petName: string
  types: readonly RecordType[]
  /** Where a new document is added; none, no row. */
  documentHref?: string | null
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
          {documentHref && (
            <li className="record-line">
              <Link href={documentHref} className="link">
                <Icon name="copy" />
                {dict.documents.chooserRow}
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </div>
  )
}
