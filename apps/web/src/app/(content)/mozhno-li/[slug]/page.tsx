import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ArticleFrame from '@/features/seo-content/components/ArticleFrame'
import { entryBySlug, safetyPath, visibleEntries } from '@/features/safety/load'
import SafetyArticle, { safetyCrumbs, safetyDescription, safetyHeading } from '@/features/safety/SafetyArticle'
import { publicPageMetadata } from '@/shared/site-metadata'

// Only the entries known at build time; anything else, a draft in production included, is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return visibleEntries().map(entry => ({ slug: entry.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = entryBySlug((await params).slug)
  if (!entry) return {}
  return publicPageMetadata({
    path: safetyPath(entry.slug),
    title: safetyHeading(entry),
    description: safetyDescription(entry),
    type: 'article',
    picture: 'own',
    ...(entry.review.status !== 'published' ? { robots: { index: false, follow: false } } : {}),
  })
}

export default async function SafetyEntryPage({ params }: Props) {
  const entry = entryBySlug((await params).slug)
  if (!entry) notFound()

  return (
    <ArticleFrame crumbs={safetyCrumbs(entry)}>
      <SafetyArticle entry={entry} />
    </ArticleFrame>
  )
}
