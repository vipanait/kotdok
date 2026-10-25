import type { Metadata } from 'next'
import { publicPageMetadata } from '@/shared/site-metadata'
import Link from 'next/link'
import ArticleFrame, { type Crumb } from '@/features/seo-content/components/ArticleFrame'
import Disclaimer from '@/features/seo-content/components/Disclaimer'

export const metadata: Metadata = publicPageMetadata({
  path: '/o-materialah',
  title: 'Как мы готовим материалы',
  description: 'Как появляются статьи Лапки о симптомах и отравлениях у кошек и собак, на какие правила они опираются и почему не заменяют ветеринарного врача.',
})

const crumbs: Crumb[] = [{ href: '/o-materialah', name: 'О материалах' }]

/** What the articles are and are not. Says plainly that no vet signed them. */
export default function AboutArticles() {
  return (
    <ArticleFrame crumbs={crumbs}>
      <div className="eyebrow">О материалах</div>
      <h1>Как мы готовим материалы</h1>
      <Disclaimer />
      <article className="card legal-doc">
        <section>
          <h2>Что это за страницы</h2>
          <p>
            Статьи о симптомах и отравлениях помогают владельцу кошки или собаки быстро понять, насколько срочна
            ситуация: ехать в клинику сейчас, записаться к врачу в течение суток или можно наблюдать. Это
            информационная проверка симптомов. Она не ставит диагноз, не назначает лечение и не заменяет осмотр
            ветеринарного врача.
          </p>
        </section>
        <section>
          <h2>Как появляется текст</h2>
          <ul>
            <li>Черновик пишет языковая модель по единому шаблону страницы.</li>
            <li>
              Второй, независимый ИИ-агент проверяет черновик: совпадают ли признаки с правилами уровней
              срочности, которые использует проверка симптомов в Лапке, нет ли доз лекарств, советов
              лечиться самостоятельно и формулировок, похожих на диагноз.
            </li>
            <li>Редакция Лапки публикует страницу и указывает дату проверки. Тексты пересматриваются не реже раза в год.</li>
          </ul>
          <p>
            Ветеринарные врачи эти страницы не подписывают. Если вы ветеринарный врач и нашли ошибку, напишите на{' '}
            <a className="legal-mail" href="mailto:support@lapka.my">support@lapka.my</a>.
          </p>
        </section>
        <section>
          <h2>Пять уровней срочности</h2>
          <p>
            На страницах те же уровни, что и в проверке симптомов: «Экстренно», «Срочно», «Наблюдаем»,
            «Домашний уход» и «Всё в порядке». При сомнении страница всегда склоняется к более срочному уровню.
          </p>
          <p>
            Страница не видит вашего питомца и не оценивает его состояние — это делает проверка симптомов
            в Лапке, которая учитывает возраст, породу и историю.
          </p>
        </section>
        <section>
          <h2>Если сомневаетесь</h2>
          <p>
            Позвоните в ветеринарную клинику. Подробнее об ограничениях сервиса — в{' '}
            <Link href="/legal" className="link">пользовательском соглашении</Link>.
          </p>
        </section>
      </article>
    </ArticleFrame>
  )
}
