import type { Metadata } from 'next'
import Link from 'next/link'
import { SAFETY_CATEGORIES } from '@lapka/contracts'
import ArticleFrame, { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import CheckCta from '@/features/seo-content/components/CheckCta'
import { publishedEntries, safetyIndex, safetyPath } from '@/features/safety/load'
import SafetyHubSearch, { VerdictPair } from '@/features/safety/SafetyHubSearch'
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

/**
 * The hub of the «Можно ли» reference: a search that runs in the browser on
 * the index built into the page, and every entry by category, which is all
 * there is without JavaScript and what a search engine follows.
 */
export default function SafetyHub() {
  const index = safetyIndex('ru')
  const byCategory = SAFETY_CATEGORIES.map(category => ({ category, items: index.filter(item => item.category === category).sort((a, b) => a.name.localeCompare(b.name, 'ru')) }))
    .filter(group => group.items.length > 0)

  return (
    <ArticleFrame crumbs={crumbs}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({ '@context': 'https://schema.org', '@graph': [organizationJsonLd, breadcrumbJsonLd(siteUrl, crumbs)] }),
        }}
      />
      <div className="eyebrow">Справочник</div>
      <h1>Можно ли это кошке или собаке</h1>
      <p className="short-answer">
        Продукты со стола, комнатные растения, лекарства для людей и бытовая химия: что можно, что с осторожностью,
        а что опасно, и что сделать, если питомец уже съел.
      </p>

      {index.length === 0 ? (
        <section className="card safety-empty" aria-labelledby="empty-title">
          <h2 id="empty-title">Справочник скоро появится</h2>
          <p>
            Мы готовим ответы о продуктах, растениях и веществах. Если питомец уже съел что-то опасное, не ждите:
            позвоните в ветеринарную клинику. <Link href="/otravlenie" className="link">Что делать при отравлении</Link>
          </p>
        </section>
      ) : (
        <>
          <SafetyHubSearch index={index} />
          {byCategory.map(({ category, items }) => (
            <section key={category} aria-labelledby={`${category}-title`} className="article-section">
              <h2 id={`${category}-title`}>{SAFETY_CATEGORY_TITLES[category]}</h2>
              <ul className="hub-list safety-list">
                {items.map(item => (
                  <li key={item.slug}>
                    <Link href={safetyPath(item.slug)} className="card hub-item">
                      <strong>{item.name}</strong>
                      <VerdictPair item={item} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <CheckCta title="Нет нужного? Спросите в приложении">
        <p>
          В приложении Лапка можно спросить о том, чего нет в справочнике — ответит ИИ, и его ответ будет помечен.
          Ответ показан для вида вашего питомца; приложение напомнит об аллергии из анкеты, а при хронических
          болезнях посоветует сначала обсудить новые продукты с врачом.
        </p>
      </CheckCta>
      <p className="footnote article-disclaimer">
        Справочник — общая информация для владельца, а не ветеринарная консультация. Если сомневаетесь, позвоните
        в ветеринарную клинику.
      </p>
    </ArticleFrame>
  )
}
