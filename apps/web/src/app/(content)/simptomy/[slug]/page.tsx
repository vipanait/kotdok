import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ArticleFrame, { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import CheckCta from '@/features/seo-content/components/CheckCta'
import Disclaimer from '@/features/seo-content/components/Disclaimer'
import { Byline, FaqSection, ListSection, RelatedSection, SourcesSection } from '@/features/seo-content/components/Sections'
import UrgencyLevels from '@/features/seo-content/components/UrgencyLevels'
import { counterpart, isDraft, linkTo, pathOf, symptomPage, symptomPages, type PageLink } from '@/features/seo-content/load'
import { articleJsonLd, SPECIES_HUB } from '@/features/seo-content/page-data'
import { siteUrl } from '@/shared/seo'
import { jsonLdScript, publicPageMetadata } from '@/shared/site-metadata'

// Only the slugs below exist; anything else is a 404, never a render on demand.
export const dynamicParams = false

export function generateStaticParams() {
  return symptomPages().map(page => ({ slug: page.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = symptomPage((await params).slug)
  if (!page) return {}
  return publicPageMetadata({
    path: pathOf(page),
    title: page.metaTitle,
    description: page.metaDescription,
    type: 'article',
    picture: 'own',
    ...(isDraft(page) ? { robots: { index: false, follow: false } } : {}),
  })
}

const AGE_TITLES = {
  cat: { young: 'Котята', adult: 'Взрослые кошки', senior: 'Пожилые кошки' },
  dog: { young: 'Щенки', adult: 'Взрослые собаки', senior: 'Пожилые собаки' },
} as const

export default async function SymptomArticle({ params }: Props) {
  const page = symptomPage((await params).slug)
  if (!page) notFound()

  const hub = SPECIES_HUB[page.species]
  const crumbs: Crumb[] = [
    { href: '/simptomy', name: 'Симптомы' },
    { href: hub.href, name: hub.name },
    { href: pathOf(page), name: page.name },
  ]
  const pair = counterpart(page)
  const related = page.related
    .map(linkTo)
    .filter((link): link is PageLink => !!link && link.href !== (pair && pathOf(pair)))
  const ages = AGE_TITLES[page.species]

  return (
    <ArticleFrame crumbs={crumbs}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(articleJsonLd(page, crumbs, breadcrumbJsonLd(siteUrl, crumbs))) }}
      />
      <article className="article-body">
        <header>
          <div className="eyebrow">{hub.eyebrow}</div>
          <h1>{page.title}</h1>
        </header>

        <p className="short-answer">{page.shortAnswer}</p>
        <div className="article-meta">
          <Byline reviewedAt={page.review.reviewedAt} draft={isDraft(page)} />
          {pair && (
            <p className="pair-link">
              {pair.species === 'dog' ? 'Для собак' : 'Для кошек'}: <Link href={pathOf(pair)} className="link">{pair.title}</Link>
            </p>
          )}
        </div>
        <Disclaimer />

        <UrgencyLevels signs={page.signs} />

        <CheckCta species={page.species} />

        <section aria-labelledby="causes-title" className="article-section">
          <h2 id="causes-title">Возможные причины по возрасту</h2>
          <p>Это частые причины такого симптома, а не вывод о вашем питомце. Что именно происходит, может сказать только врач после осмотра.</p>
          <div className="grid3 causes">
            {(['young', 'adult', 'senior'] as const).map(age => (
              <div key={age} className="card">
                <h3>{ages[age]}</h3>
                <ul>{page.causesByAge[age].map(cause => <li key={cause}>{cause}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>

        <ListSection id="home-title" title="Что сделать дома до визита" items={page.homeSteps} />
        <ListSection id="avoid-title" title="Чего не делать" items={page.avoid} />
        <ListSection id="vet-title" title="Что сказать врачу" items={page.tellVet}>
          <p>Врачу будет проще, если вы заранее ответите на эти вопросы — можно прямо в заметках телефона.</p>
        </ListSection>

        <FaqSection faq={page.faq} />
        <RelatedSection links={related} />
        <SourcesSection sources={page.sources} />
        <Disclaimer compact />
      </article>
    </ArticleFrame>
  )
}
