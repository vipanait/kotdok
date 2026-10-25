// The same picture as opengraph-image.tsx; route config cannot be re-exported, so it is repeated.
import { toxinPage, toxinPages } from '@/features/seo-content/load'
import { ogSize, renderOgCard } from '@/shared/og-card'

export const alt = 'Отравления у кошек и собак — Лапка'
export const size = ogSize
export const contentType = 'image/png'
export const dynamicParams = false

export function generateStaticParams() {
  return toxinPages().map(page => ({ slug: page.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = toxinPage((await params).slug)
  return renderOgCard({
    title: page?.title ?? 'Отравления у кошек и собак',
    description: page?.metaDescription ?? '',
    tags: ['Что сделать сразу', 'Чего не делать', 'Не заменяет ветеринара'],
  })
}
