import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ArticleFrame, { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import CheckCta, { SIGN_UP_HREF } from '@/features/seo-content/components/CheckCta'
import Disclaimer, { ARTICLE_NOTICE } from '@/features/seo-content/components/Disclaimer'
import { Byline, FaqSection, ListSection, RelatedSection, SourcesSection } from '@/features/seo-content/components/Sections'
import UrgencyLevels from '@/features/seo-content/components/UrgencyLevels'
import UrgencyQuiz from '@/features/seo-content/components/UrgencyQuiz'
import { counterpart, isDraft, linkTo, symptomPage, symptomPages, type PageLink } from '@/features/seo-content/load'
import { articleJsonLd, quizOutcomes, SPECIES_HUB } from '@/features/seo-content/page-data'
import { siteUrl } from '@/shared/seo'
import { jsonLdScript } from '@/shared/site-metadata'
import ru from '@/shared/i18n/dictionaries/ru'

// Only the slugs below exist; anything else is a 404, never a render on demand.
export const dynamicParams = false

export function generateStaticParams() {
  return symptomPages().map(page => ({ slug: page.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = symptomPage((await params).slug)
  if (!page) return {}
  const path = `/simptomy/${page.slug}`
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: path },
    openGraph: { type: 'article', url: path, title: page.metaTitle, description: page.metaDescription },
    twitter: { title: page.metaTitle, description: page.metaDescription },
    ...(isDraft(page) ? { robots: { index: false, follow: false } } : {}),
  }
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
    { href: `/simptomy/${page.slug}`, name: page.name },
  ]
  const pair = counterpart(page)
  const related = page.related
    .map(linkTo)
    .filter((link): link is PageLink => !!link && link.href !== (pair && `/simptomy/${pair.slug}`))
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
          <Byline reviewedAt={page.review.reviewedAt} draft={isDraft(page)} />
          {pair && (
            <p className="pair-link">
              <Link href={`/simptomy/${pair.slug}`} className="link">{pair.title}</Link>
            </p>
          )}
        </header>

        <p className="short-answer">{page.shortAnswer}</p>
        <Disclaimer />

        <UrgencyLevels signs={page.signs} />

        <UrgencyQuiz
          questions={page.quiz}
          outcomes={quizOutcomes(ru)}
          notice={`${ARTICLE_NOTICE} ${ru.check.disclaimerFallback}`}
          signUpHref={SIGN_UP_HREF}
        />

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

        <CheckCta species={page.species} />

        <FaqSection faq={page.faq} />
        <RelatedSection links={related} />
        <SourcesSection sources={page.sources} />
        <Disclaimer compact />
      </article>
    </ArticleFrame>
  )
}
