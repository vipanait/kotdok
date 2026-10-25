import Link from 'next/link'
import { APP_STORE_LINKS } from '@/shared/app-store-links'

/** Where a sign-up from an article leads: straight to adding the pet. */
export const SIGN_UP_HREF = '/register?next=/pets/new'

/**
 * The way from an article into the product. The free checks are the reason
 * to sign up; the model only ever runs for a signed-in owner.
 */
export default function CheckCta({ species }: { species?: 'cat' | 'dog' }) {
  const pet = species === 'dog' ? 'собаки' : species === 'cat' ? 'кошки' : 'питомца'
  return (
    <section className="card cta" aria-labelledby="cta-title">
      <h2 id="cta-title">Проверьте симптомы {pet} в Лапке</h2>
      <p>
        Опишите, что происходит, и ответьте на уточняющие вопросы. Лапка учтёт возраст, породу и историю
        питомца и подскажет уровень срочности, что сделать дома и что спросить у врача.
      </p>
      <div className="row cta-actions">
        <Link href={SIGN_UP_HREF} className="btn primary">Зарегистрироваться — 2 проверки бесплатно</Link>
        <a href={APP_STORE_LINKS.ios} className="link" rel="noopener">App Store</a>
        <a href={APP_STORE_LINKS.android} className="link" rel="noopener">Google Play</a>
      </div>
    </section>
  )
}
