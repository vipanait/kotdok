import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import Illustration from '@/components/ui/Illustration'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/** No pets yet: the pair in a bed and the way to add the first one. */
export default function PetsEmptyCard({ dict }: { dict: Dictionary }) {
  const t = dict.dashboard
  return (
    <section className="card empty" aria-labelledby="pets-empty-title">
      <Illustration name="pets-together" size={210} />
      <h2 id="pets-empty-title">{t.emptyTitle}</h2>
      <p>{t.emptyBody}</p>
      <Link href="/pets/new" className="btn primary">
        {t.addPetBtn}
        <Icon name="plus" />
      </Link>
    </section>
  )
}
