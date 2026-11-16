import { entryBySlug, visibleEntries } from '@/features/safety/load'
import { safetyDescription, safetyHeading } from '@/features/safety/SafetyArticle'
import { ogSize, renderOgCard } from '@/shared/og-card'

export const alt = 'Можно ли это кошке или собаке — Лапка'
export const size = ogSize
export const contentType = 'image/png'
export const dynamicParams = false

export function generateStaticParams() {
  return visibleEntries().map(entry => ({ slug: entry.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const entry = entryBySlug((await params).slug)
  return renderOgCard({
    title: entry ? safetyHeading(entry) : 'Можно ли это кошке или собаке',
    description: entry ? safetyDescription(entry) : '',
    tags: ['Кошки и собаки', 'Если уже съел', 'Не заменяет ветеринара'],
  })
}
