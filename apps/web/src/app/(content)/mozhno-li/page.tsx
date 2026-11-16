import type { Metadata } from 'next'
import Link from 'next/link'
import { SAFETY_CATEGORIES } from '@lapka/contracts'
import { safetyCategoryIcon } from '@lapka/shared'
import Illustration from '@/components/ui/Illustration'
import ArticleFrame, { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import { publishedEntries, safetyIndex } from '@/features/safety/load'
import SafetyAppCta from '@/features/safety/SafetyAppCta'
import SafetyFootnote from '@/features/safety/SafetyFootnote'
import SafetyHubSearch from '@/features/safety/SafetyHubSearch'
import SafetyIcon from '@/features/safety/SafetyIcon'
import { SafetyCardGrid, categoryAnchor } from '@/features/safety/SafetyItemCard'
import { SAFETY_CATEGORY_TITLES } from '@/features/safety/verdict'
import { siteUrl } from '@/shared/seo'
import { jsonLdScript, organizationJsonLd, publicPageMetadata } from '@/shared/site-metadata'

const meta = {
  path: '/mozhno-li',
  title: 'Можно ли кошкам и собакам: продукты, растения, лекарства',
  description: 'Справочник Лапки: можно ли кошке или собаке шоколад, виноград, молоко, лилии, лекарства для людей и бытовую химию, и что сделать, если питомец уже съел.',
}

export function generateMetadata(): Metadata {
  // Until the owner publishes the first entry the hub is an empty page: not worth indexing.
  return publicPageMetadata({ ...meta, ...(publishedEntries().length === 0 ? { robots: { index: false, follow: true } } : {}) })
}

const crumbs: Crumb[] = [{ href: '/mozhno-li', name: 'Можно ли питомцу' }]

/** «Часто спрашивают» (the design's six); an entry that is not visible is skipped. */
const POPULAR = ['shokolad', 'vinograd', 'moloko', 'liliya', 'yabloko', 'ibuprofen'] as const

/**
 * The hub of the «Можно ли» reference (design v1): the search box with the
 * category chips, «Часто спрашивают», and every entry by category — the
 * catalogue is server-rendered links, all there is without JavaScript and
 * what a search engine follows; the search filters it in the browser.
 */
export default function SafetyHub() {
  const index = safetyIndex('ru')
  const byCategory = SAFETY_CATEGORIES.map(category => ({ category, items: index.filter(item => item.category === category).sort((a, b) => a.name.localeCompare(b.name, 'ru')) }))
    .filter(group => group.items.length > 0)

  // Drawn by the search while nothing is typed; a query swaps it for «Поиск по справочнику».
  const hero = (
    <header className="safety-hero">
      <div>
        <div className="eyebrow">Справочник</div>
        <h1>Можно ли это кошке или собаке</h1>
        <p className="short-answer">
          Продукты со стола, комнатные растения, лекарства для людей и бытовая химия: что можно, что с осторожностью,
          а что опасно, и что сделать, если питомец уже съел.
        </p>
      </div>
      <Illustration name="pets-together" size={230} className="art safety-hero-art" eager />
    </header>
  )

  return (
    <ArticleFrame crumbs={crumbs} className="safety-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({ '@context': 'https://schema.org', '@graph': [organizationJsonLd, breadcrumbJsonLd(siteUrl, crumbs)] }),
        }}
      />

      {index.length === 0 ? (
        <>
          {hero}
          <section className="safety-state" aria-labelledby="empty-title">
            <h2 id="empty-title">Справочник скоро появится</h2>
            <p>
              Мы готовим ответы о продуктах, растениях и веществах. Если питомец уже съел что-то опасное, не ждите:
              позвоните в ветеринарную клинику.
            </p>
            <Link href="/otravlenie" className="btn primary">Что делать при отравлении</Link>
          </section>
        </>
      ) : (
        <SafetyHubSearch hero={hero} index={index} popular={POPULAR}>
          <section id="catalogue" aria-labelledby="catalogue-title" className="safety-section">
            <div className="safety-sectionhead">
              <h2 id="catalogue-title">Весь справочник</h2>
            </div>
            {byCategory.map(({ category, items }) => (
              <section key={category} id={categoryAnchor(category)} aria-labelledby={`${category}-title`} className="safety-category">
                <h3 id={`${category}-title`}>
                  <SafetyIcon name={safetyCategoryIcon(category)} size="chip" />
                  {SAFETY_CATEGORY_TITLES[category]}
                </h3>
                <SafetyCardGrid items={items} />
              </section>
            ))}
          </section>
        </SafetyHubSearch>
      )}

      <SafetyAppCta title="Ответ для вашего питомца" layout="banner">
        <p>
          В приложении Лапка ответ показан для вида вашего питомца: оно напомнит об аллергии из анкеты, а при
          хронических болезнях посоветует сначала обсудить новые продукты с врачом. Чего нет в справочнике, можно
          спросить ИИ — его ответ будет помечен.
        </p>
      </SafetyAppCta>
      <SafetyFootnote />
    </ArticleFrame>
  )
}
