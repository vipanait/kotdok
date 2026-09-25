import Link from 'next/link'
import Icon from '@/components/ui/Icon'

/** Head of the pet profile pages: the name, what the page is for, the way back to the list. */
export default function PetPageHead({
  title,
  subtitle,
  backLabel,
}: {
  title: string
  subtitle: string
  backLabel: string
}) {
  return (
    <div className="pagehead">
      <div>
        <h1 className="pet-page-title">{title}</h1>
        <p>{subtitle}</p>
      </div>
      <Link href="/pets" className="link">
        <Icon name="back" />
        {backLabel}
      </Link>
    </div>
  )
}
