import type { Metadata } from 'next'
import Link from 'next/link'
import ArticleFrame, { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import CheckCta from '@/features/seo-content/components/CheckCta'
import Disclaimer from '@/features/seo-content/components/Disclaimer'
import { EmergencySigns } from '@/features/seo-content/components/EmergencySigns'
import { symptomPages } from '@/features/seo-content/load'
import ru from '@/shared/i18n/dictionaries/ru'
import { siteUrl } from '@/shared/seo'
import { defaultOgImages, jsonLdScript, organizationJsonLd } from '@/shared/site-metadata'
import { URGENCY_KEYS, urgencyTitle } from '@/shared/utils/urgency'

export const metadata: Metadata = {
  title: 'Симптомы у кошек и собак: насколько это срочно',
  description: 'Справочник симптомов у кошек и собак: когда ехать в клинику сразу, когда в течение суток, а когда можно наблюдать дома. Короткий тест «Это срочно?» на каждой странице.',
  alternates: { canonical: '/simptomy' },
  openGraph: { url: '/simptomy', images: defaultOgImages },
}

const crumbs: Crumb[] = [{ href: '/simptomy', name: 'Симптомы' }]

/** The entry to the articles: the five levels, the signs that cannot wait, the two species. */
export default function Symptoms() {
  const counts = { cat: symptomPages('cat').length, dog: symptomPages('dog').length }

  return (
    <ArticleFrame crumbs={crumbs}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({ '@context': 'https://schema.org', '@graph': [organizationJsonLd, breadcrumbJsonLd(siteUrl, crumbs)] }),
        }}
      />
      <div className="eyebrow">Справочник</div>
      <h1>Симптомы у кошек и собак</h1>
      <p className="short-answer">
        Когда с питомцем что-то не так, первый вопрос — насколько это срочно. Здесь собраны частые симптомы
        с признаками по пяти уровням срочности: от «сразу в клинику» до «ничего делать не нужно».
      </p>
      <Disclaimer />

      <EmergencySigns />

      <div className="grid2 hub-species">
        <Link href="/simptomy/koshki" className="card hub-item">
          <strong>Кошки</strong>
          <span>{counts.cat} симптомов: рвота, понос, не ест, не может пописать, тяжело дышит…</span>
        </Link>
        <Link href="/simptomy/sobaki" className="card hub-item">
          <strong>Собаки</strong>
          <span>{counts.dog} симптомов: рвота, понос, вздулся живот, хромает, тяжело дышит…</span>
        </Link>
      </div>

      <section className="article-section" aria-labelledby="levels-title">
        <h2 id="levels-title">Пять уровней срочности</h2>
        <p>Те же уровни показывает проверка симптомов в приложении Лапка.</p>
        <ul className="level-legend">
          {URGENCY_KEYS.map(key => (
            <li key={key} className={key}>
              <span className="badge"><i aria-hidden="true" />{urgencyTitle(ru.urgency[key].label)}</span>
              <span>{ru.urgency[key].action}</span>
            </li>
          ))}
        </ul>
      </section>

      <p><Link href="/otravlenie" className="link">Отравления: что делать, если питомец съел опасное</Link></p>
      <CheckCta />
      <Disclaimer compact />
    </ArticleFrame>
  )
}
