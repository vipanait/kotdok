import Link from 'next/link'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

export type PetSavedKind = 'created' | 'updated' | 'deleted'

export function parsePetSaved(value: string | string[] | undefined): PetSavedKind | null {
  return value === 'created' || value === 'updated' || value === 'deleted' ? value : null
}

/**
 * Confirmation after the pet form: `?petSaved=created|updated|deleted`.
 * A new pet also gets the next step, checking its symptoms, when the balance
 * allows one.
 */
export default function PetSavedBanner({
  kind,
  dict,
  canCheck,
}: {
  kind: PetSavedKind
  dict: Dictionary
  canCheck: boolean
}) {
  const t = dict.dashboard
  const text = kind === 'created' ? t.petAdded : kind === 'deleted' ? t.petDeleted : t.petSaved
  return (
    <div role="status" className="banner toast-banner pet-saved-banner">
      <span>{text}</span>
      {kind === 'created' && canCheck && (
        <Link href="/check" className="link">{t.welcomeCta}</Link>
      )}
    </div>
  )
}
