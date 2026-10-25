import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ArticleFrame, { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import CheckCta, { SIGN_UP_HREF } from '@/features/seo-content/components/CheckCta'
import Disclaimer from '@/features/seo-content/components/Disclaimer'
import { Byline, FaqSection, ListSection, RelatedSection, SourcesSection } from '@/features/seo-content/components/Sections'
import UrgencyQuiz from '@/features/seo-content/components/UrgencyQuiz'
import { isDraft, linkTo, pathOf, toxinPage, toxinPages, type PageLink } from '@/features/seo-content/load'
import { articleJsonLd, quizOutcomes } from '@/features/seo-content/page-data'
import ru from '@/shared/i18n/dictionaries/ru'
import { siteUrl } from '@/shared/seo'
import { jsonLdScript, publicPageMetadata } from '@/shared/site-metadata'
import { urgencyTitle } from '@/shared/utils/urgency'

export const dynamicParams = false

export function generateStaticParams() {
  return toxinPages().map(page => ({ slug: page.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = toxinPage((await params).slug)
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

const SPECIES_TITLES = { cat: 'Кошки', dog: 'Собаки' } as const

export default async function ToxinArticle({ params }: Props) {
  const page = toxinPage((await params).slug)
  if (!page) notFound()

  const crumbs: Crumb[] = [
    { href: '/otravlenie', name: 'Отравления' },
    { href: pathOf(page), name: page.name },
  ]
  const related = page.related.map(linkTo).filter((link): link is PageLink => !!link)
  const emergency = ru.urgency.emergency

  return (
    <ArticleFrame crumbs={crumbs}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(articleJsonLd(page, crumbs, breadcrumbJsonLd(siteUrl, crumbs))) }}
      />
      <article className="article-body">
        <header>
          <div className="eyebrow">Отравления</div>
          <h1>{page.title}</h1>
        </header>

        <div className="card level emergency toxin-alert">
          <div className="level-head">
            <span className="badge"><i aria-hidden="true" />{urgencyTitle(emergency.label)}</span>
            <strong>{emergency.action}</strong>
          </div>
          <p>Если питомец съел или мог съесть это вещество, не ждите признаков: позвоните в ветеринарную клинику сейчас.</p>
        </div>

        <p className="short-answer">{page.shortAnswer}</p>
        <div className="article-meta">
          <Byline reviewedAt={page.review.reviewedAt} draft={isDraft(page)} />
        </div>
        <Disclaimer />

        <ListSection id="where-title" title="Где встречается" items={page.whereFound} />

        <section aria-labelledby="species-title" className="article-section">
          <h2 id="species-title">Чем опасно</h2>
          <div className="grid2 causes">
            {(['cat', 'dog'] as const).map(species => {
              const part = page.bySpecies[species]
              if (!part) return null
              return (
                <div key={species} className="card">
                  <h3>{SPECIES_TITLES[species]}</h3>
                  <p>{part.risk}</p>
                  <p className="small">Признаки отравления:</p>
                  <ul>{part.signs.map(sign => <li key={sign}>{sign}</li>)}</ul>
                </div>
              )
            })}
          </div>
        </section>

        <ListSection id="first-title" title="Что сделать сразу" items={page.firstSteps} ordered />
        <ListSection id="avoid-title" title="Чего не делать" items={page.avoid} />

        <UrgencyQuiz questions={page.quiz} outcomes={quizOutcomes(ru)} signUpHref={SIGN_UP_HREF} />

        <ListSection id="vet-title" title="Что сказать врачу" items={page.tellVet} />
        <CheckCta />
        <FaqSection faq={page.faq} />
        <RelatedSection links={related} />
        <SourcesSection sources={page.sources} />
        <Disclaimer compact />
      </article>
    </ArticleFrame>
  )
}
