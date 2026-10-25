import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { siteUrl } from '@/shared/seo'
import { organizationId, organizationJsonLd } from '@/shared/site-metadata'
import { urgencyTitle } from '@/shared/utils/urgency'
import type { Crumb } from './components/ArticleFrame'
import type { QuizOutcome } from './quiz'
import type { ContentPage, Species } from './schema'

export const SPECIES_HUB: Record<Species, { href: string; name: string; eyebrow: string }> = {
  cat: { href: '/simptomy/koshki', name: 'Кошки', eyebrow: 'Симптомы у кошек' },
  dog: { href: '/simptomy/sobaki', name: 'Собаки', eyebrow: 'Симптомы у собак' },
}

/** The three outcomes of «Это срочно?», named and worded as in the app. */
export function quizOutcomes(dict: Dictionary): Record<QuizOutcome, { label: string; action: string }> {
  const of = (key: QuizOutcome) => ({ label: urgencyTitle(dict.urgency[key].label), action: dict.urgency[key].action })
  return { emergency: of('emergency'), urgent: of('urgent'), monitor: of('monitor') }
}

function pathOf(page: ContentPage): string {
  return page.kind === 'symptom' ? `/simptomy/${page.slug}` : `/otravlenie/${page.slug}`
}

/**
 * Structured data of an article: the page itself (`MedicalWebPage`, with the
 * date of the last check but no `reviewedBy` — nobody signed it as a vet), its
 * breadcrumbs and the FAQ exactly as shown.
 */
export function articleJsonLd(page: ContentPage, crumbs: Crumb[], breadcrumbs: object) {
  const url = `${siteUrl}${pathOf(page)}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationJsonLd,
      {
        '@type': 'MedicalWebPage',
        '@id': `${url}#page`,
        url,
        name: page.title,
        description: page.metaDescription,
        inLanguage: 'ru',
        ...(page.review.reviewedAt ? { lastReviewed: page.review.reviewedAt } : {}),
        about: { '@type': 'Thing', name: crumbs[crumbs.length - 1]?.name ?? page.title },
        publisher: { '@id': organizationId },
      },
      breadcrumbs,
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: page.faq.map(item => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  }
}
