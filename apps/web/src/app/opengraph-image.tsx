import { defaultSeo } from '@/shared/seo'
import { ogSize, renderOgCard } from '@/shared/og-card'

export const alt = 'Лапка — AI симптомчекер для кошек и собак'
export const size = ogSize

export const contentType = 'image/png'

export default function OpenGraphImage() {
  return renderOgCard({
    title: 'AI симптомчекер для кошек и собак',
    description: defaultSeo.description,
    tags: ['Оценка срочности', 'Рекомендации за 1 минуту', 'Не заменяет ветеринара'],
  })
}
