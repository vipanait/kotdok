import Link from 'next/link'
import ArticleFrame, { breadcrumbJsonLd, type Crumb } from './ArticleFrame'
import CheckCta from './CheckCta'
import Disclaimer from './Disclaimer'
import { EmergencySigns } from './EmergencySigns'
import { pathOf, symptomPages } from '../load'
import { SPECIES_HUB } from '../page-data'
import { BODY_SYSTEMS, type BodySystem, type Species } from '../schema'
import { siteUrl } from '@/shared/seo'
import { jsonLdScript, organizationJsonLd } from '@/shared/site-metadata'

export const BODY_SYSTEM_TITLES: Record<BodySystem, string> = {
  digestive: 'Пищеварение',
  urinary: 'Мочеиспускание',
  breathing: 'Дыхание',
  skin: 'Кожа и шерсть',
  eyes_ears: 'Глаза и уши',
  mouth: 'Рот и зубы',
  nervous: 'Нервная система',
  movement: 'Движение',
  general: 'Общее состояние',
}

const TITLES: Record<Species, { h1: string; lead: string }> = {
  cat: {
    h1: 'Симптомы у кошек',
    lead: 'Выберите, что происходит с кошкой. На каждой странице — признаки, при которых нужно ехать в клинику сразу, в течение суток или можно наблюдать, и что сделать до визита.',
  },
  dog: {
    h1: 'Симптомы у собак',
    lead: 'Выберите, что происходит с собакой. На каждой странице — признаки, при которых нужно ехать в клинику сразу, в течение суток или можно наблюдать, и что сделать до визита.',
  },
}

/** /simptomy/koshki and /simptomy/sobaki: the species' articles by body system. */
export default function SpeciesHub({ species }: { species: Species }) {
  const hub = SPECIES_HUB[species]
  const pages = symptomPages(species)
  const crumbs: Crumb[] = [{ href: '/simptomy', name: 'Симптомы' }, { href: hub.href, name: hub.name }]
  const groups = BODY_SYSTEMS.map(system => ({
    system,
    pages: pages.filter(page => page.bodySystem === system).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  })).filter(group => group.pages.length > 0)

  return (
    <ArticleFrame crumbs={crumbs}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({ '@context': 'https://schema.org', '@graph': [organizationJsonLd, breadcrumbJsonLd(siteUrl, crumbs)] }),
        }}
      />
      <div className="eyebrow">Симптомы</div>
      <h1>{TITLES[species].h1}</h1>
      <p className="short-answer">{TITLES[species].lead}</p>
      <EmergencySigns species={species} />
      <nav aria-label="Разделы" className="hub-anchors">
        {groups.map(group => (
          <a key={group.system} href={`#group-${group.system}`} className="chip static">{BODY_SYSTEM_TITLES[group.system]}</a>
        ))}
      </nav>
      {groups.map(group => (
        <section key={group.system} className="article-section species-hub" aria-labelledby={`group-${group.system}`}>
          <h2 id={`group-${group.system}`}>{BODY_SYSTEM_TITLES[group.system]}</h2>
          <ul className="hub-list">
            {group.pages.map(page => (
              <li key={page.slug}>
                <Link href={pathOf(page)} className="card hub-item">
                  <strong>{page.name}</strong>
                  <span>{page.metaDescription}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p><Link href="/otravlenie" className="link">Отравления: лилии, шоколад, виноград, ксилит, парацетамол, антифриз</Link></p>
      <CheckCta species={species} />
      <Disclaimer compact />
    </ArticleFrame>
  )
}
