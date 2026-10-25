import type { Metadata } from 'next'
import Link from 'next/link'
import Illustration from '@/components/ui/Illustration'
import ArticleFrame from '@/features/seo-content/components/ArticleFrame'

export const metadata: Metadata = { title: 'Такой страницы нет', robots: { index: false, follow: false } }

/** A slug that is not (or not yet) published. Static, like everything here. */
export default function ContentNotFound() {
  return (
    <ArticleFrame>
      <div className="empty">
        <Illustration name="welcome-pets" size={210} eager />
        <div className="eyebrow">Ошибка 404</div>
        <h1>Такой страницы нет</h1>
        <p>Возможно, адрес набран с ошибкой. Посмотрите все статьи о симптомах.</p>
        <Link href="/simptomy" className="btn primary">Все симптомы</Link>
      </div>
    </ArticleFrame>
  )
}
