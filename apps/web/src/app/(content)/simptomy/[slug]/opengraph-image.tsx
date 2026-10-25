import { symptomPage, symptomPages } from '@/features/seo-content/load'
import { ogSize, renderOgCard } from '@/shared/og-card'

export const alt = 'Симптомы у питомца — Лапка'
export const size = ogSize
export const contentType = 'image/png'
export const dynamicParams = false

export function generateStaticParams() {
  return symptomPages().map(page => ({ slug: page.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = symptomPage((await params).slug)
  return renderOgCard({
    title: page?.title ?? 'Симптомы у кошек и собак',
    description: page?.metaDescription ?? '',
    tags: ['Насколько это срочно', 'Что сделать дома', 'Не заменяет ветеринара'],
  })
}
