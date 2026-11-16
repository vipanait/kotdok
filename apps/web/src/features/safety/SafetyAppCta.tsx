import Link from 'next/link'
import type { ReactNode } from 'react'
import { SIGN_UP_HREF } from '@/features/seo-content/components/CheckCta'
import { APP_STORE_LINKS } from '@/shared/app-store-links'

/**
 * The way from a «Можно ли» page into the product, in the design's shape: a
 * wide mint banner under the hub's lists, a card in the entry's right column.
 * The ways out are the articles' own (CheckCta): sign up on the site, or the
 * app in either store — nothing guesses the visitor's OS.
 */
export default function SafetyAppCta({
  title,
  layout,
  children,
}: {
  title: string
  layout: 'banner' | 'aside'
  children: ReactNode
}) {
  return (
    <section className={`safety-cta ${layout}`} aria-labelledby="cta-title">
      <div className="safety-cta-copy">
        <h2 id="cta-title">{title}</h2>
        {children}
      </div>
      <div className="safety-cta-actions">
        <Link href={SIGN_UP_HREF} className="btn primary">Зарегистрироваться — 2 проверки бесплатно</Link>
        <span className="safety-stores">
          <a href={APP_STORE_LINKS.ios} className="link" rel="noopener">App Store <span aria-hidden="true">↗</span></a>
          <a href={APP_STORE_LINKS.android} className="link" rel="noopener">Google Play <span aria-hidden="true">↗</span></a>
        </span>
      </div>
    </section>
  )
}
