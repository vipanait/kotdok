import type { Metadata } from 'next'
import Link from 'next/link'
import ArticleFrame, { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import CheckCta from '@/features/seo-content/components/CheckCta'
import Disclaimer from '@/features/seo-content/components/Disclaimer'
import { pathOf, toxinPages } from '@/features/seo-content/load'
import ru from '@/shared/i18n/dictionaries/ru'
import { siteUrl } from '@/shared/seo'
import { jsonLdScript, organizationJsonLd, publicPageMetadata } from '@/shared/site-metadata'
import { urgencyTitle } from '@/shared/utils/urgency'

export const metadata: Metadata = publicPageMetadata({
  path: '/otravlenie',
  title: 'Отравления у кошек и собак: что делать',
  description: 'Лилии, шоколад, виноград и изюм, ксилит, парацетамол, антифриз: чем опасны для кошек и собак, какие признаки отравления и что сделать сразу.',
})

const crumbs: Crumb[] = [{ href: '/otravlenie', name: 'Отравления' }]

export default function Poisonings() {
  const pages = toxinPages()
  const emergency = ru.urgency.emergency

  return (
    <ArticleFrame crumbs={crumbs}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({ '@context': 'https://schema.org', '@graph': [organizationJsonLd, breadcrumbJsonLd(siteUrl, crumbs)] }),
        }}
      />
      <div className="eyebrow">Справочник</div>
      <h1>Отравления у кошек и собак</h1>
      <p className="short-answer">
        Если питомец съел или мог съесть что-то опасное, не ждите признаков: многие яды действуют через
        несколько часов, когда помочь уже труднее. Позвоните в ветеринарную клинику и возьмите с собой упаковку.
      </p>
      <div className="card level emergency">
        <div className="level-head">
          <span className="badge"><i aria-hidden="true" />{urgencyTitle(emergency.label)}</span>
          <strong>{emergency.action}</strong>
        </div>
        <p>Подозрение на отравление — всегда повод для срочного обращения, даже если питомец выглядит нормально.</p>
      </div>
      <Disclaimer />
      <ul className="hub-list">
        {pages.map(page => (
          <li key={page.slug}>
            <Link href={pathOf(page)} className="card hub-item">
              <strong>{page.name}</strong>
              <span>{page.metaDescription}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p><Link href="/simptomy" className="link">Все симптомы у кошек и собак</Link></p>
      <CheckCta />
      <Disclaimer compact />
    </ArticleFrame>
  )
}
