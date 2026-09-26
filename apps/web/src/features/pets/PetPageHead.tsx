import Link from 'next/link'
import Icon from '@/components/ui/Icon'

/** Head of the pet profile pages: the name, what the page is for, the way back. */
export default function PetPageHead({
  title,
  subtitle,
  backLabel,
  backHref = '/pets',
}: {
  title: string
  subtitle: string
  backLabel: string
  /** The pet list by default; the medical record for a pet's own form. */
  backHref?: string
}) {
  return (
    <div className="pagehead">
      <div>
        <h1 className="pet-page-title">{title}</h1>
        <p>{subtitle}</p>
      </div>
      <Link href={backHref} className="link">
        <Icon name="back" />
        {backLabel}
      </Link>
    </div>
  )
}
