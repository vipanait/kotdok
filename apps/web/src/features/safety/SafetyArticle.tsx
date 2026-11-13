import Link from 'next/link'
import { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import CheckCta from '@/features/seo-content/components/CheckCta'
import { SourcesSection } from '@/features/seo-content/components/Sections'
import { pathOf, toxinPage } from '@/features/seo-content/load'
import { safetyPath } from '@/shared/content-paths'
import { siteUrl } from '@/shared/seo'
import { jsonLdScript } from '@/shared/site-metadata'
import type { SafetyEntry, SafetyVerdict } from './schema'
import { MEDICINE_LINE, SAFETY_CATEGORY_TITLES, verdictView } from './verdict'

/**
 * One «Можно ли» entry as a public page (docs/superpowers/specs/2026-11-13-pet-safety-design.md,
 * «Сайт»): the answer for cats and dogs, why, the signs, what to do if the
 * pet has already eaten it, sources. One page for both species, as for the
 * poisonings, so the texts are not repeated per species. The site has the
 * reference only — no AI answer, no pet profile; that is what the app is for.
 */

const SPECIES = ['cat', 'dog'] as const
const SPECIES_DATIVE = { cat: 'Кошкам', dog: 'Собакам' } as const
const SPECIES_TITLES = { cat: 'Кошки', dog: 'Собаки' } as const
const SEVERITY: Record<SafetyVerdict, number> = { safe: 0, caution: 1, danger: 2 }

/** What the question is about, mid-sentence: the accusative from the file, or the name in lower case. */
function subject(entry: SafetyEntry): string {
  return entry.titleRu ?? entry.name.ru.charAt(0).toLowerCase() + entry.name.ru.slice(1)
}

/** The H1 and the page title: the question people type, when the file gives the accusative. */
export function safetyHeading(entry: SafetyEntry): string {
  return entry.titleRu ? `Можно ли кошкам и собакам ${entry.titleRu}?` : `${entry.name.ru}: можно ли кошкам и собакам`
}

/** The meta description: the answer for the species it is worse for (the dog's on a tie). */
export function safetyDescription(entry: SafetyEntry): string {
  const { cat, dog } = entry.bySpecies
  return (SEVERITY[cat.verdict] > SEVERITY[dog.verdict] ? cat : dog).summary.ru
}

export function safetyCrumbs(entry: SafetyEntry): Crumb[] {
  return [
    { href: '/mozhno-li', name: 'Можно ли питомцу' },
    { href: safetyPath(entry.slug), name: entry.name.ru },
  ]
}

/** schema.org FAQPage: «Можно ли кошке …?» and «Можно ли собаке …?», answered by the summaries. */
export function safetyFaqJsonLd(entry: SafetyEntry) {
  const question = (species: 'cat' | 'dog') => ({
    '@type': 'Question' as const,
    name: `Можно ли ${species === 'cat' ? 'кошке' : 'собаке'} ${subject(entry)}?`,
    acceptedAnswer: { '@type': 'Answer' as const, text: entry.bySpecies[species].summary.ru },
  })
  return { '@type': 'FAQPage' as const, mainEntity: [question('cat'), question('dog')] }
}

const IF_EATEN_LEAD = {
  call_now: 'Сразу позвоните в клинику, не ждите признаков.',
  watch: 'Наблюдайте. Если появятся признаки — проверьте симптомы.',
} as const

export default function SafetyArticle({ entry }: { entry: SafetyEntry }) {
  const draft = entry.review.status !== 'published'
  const toxin = entry.toxinSlug ? toxinPage(entry.toxinSlug) : undefined
  const eaten = SPECIES.filter(species => entry.bySpecies[species].ifEaten !== 'none')
  const sameIfEaten = eaten.length === 2 && entry.bySpecies.cat.ifEaten === entry.bySpecies.dog.ifEaten
  const withSigns = SPECIES.filter(species => entry.bySpecies[species].signs.ru.length > 0)

  return (
    <article className="article-body safety-article">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            '@context': 'https://schema.org',
            '@graph': [safetyFaqJsonLd(entry), breadcrumbJsonLd(siteUrl, safetyCrumbs(entry))],
          }),
        }}
      />
      <header>
        <div className="eyebrow">Можно ли питомцу · {SAFETY_CATEGORY_TITLES[entry.category]}</div>
        <h1>{safetyHeading(entry)}</h1>
      </header>

      <div className="grid2 causes safety-verdicts">
        {SPECIES.map(species => {
          const part = entry.bySpecies[species]
          const view = verdictView(entry.category, part.verdict)
          return (
            <div key={species} className={`card level ${view.tone}`}>
              <div className="level-head">
                <span className="badge"><i aria-hidden="true" />{SPECIES_DATIVE[species]}: {view.label}</span>
              </div>
              <p>{part.summary.ru}</p>
            </div>
          )
        })}
      </div>
      {entry.category === 'medicine' && <p className="safety-medicine-line"><strong>{MEDICINE_LINE}</strong></p>}

      <div className="article-meta">
        <p className="byline">
          {draft ? (
            <strong className="draft-mark">Черновик: страница ещё не опубликована и не проверена.</strong>
          ) : (
            'Подготовлено с помощью ИИ по ветеринарным источникам. Ветеринарный врач текст не подписывал.'
          )}{' '}
          <Link href="/o-materialah" className="link">Как мы готовим материалы</Link>
        </p>
      </div>
      <p className="banner article-disclaimer">
        Справочник — общая информация для владельца, а не ветеринарная консультация. Если сомневаетесь, позвоните
        в ветеринарную клинику.
      </p>

      <section aria-labelledby="why-title" className="article-section">
        <h2 id="why-title">Почему</h2>
        {SPECIES.map(species => (
          <div key={species} className="safety-why">
            <h3>{SPECIES_TITLES[species]}</h3>
            <p>{entry.bySpecies[species].why.ru}</p>
          </div>
        ))}
      </section>

      {withSigns.length > 0 && (
        <section aria-labelledby="signs-title" className="article-section">
          <h2 id="signs-title">Признаки</h2>
          <div className="grid2 causes">
            {withSigns.map(species => (
              <div key={species} className="card">
                <h3>{SPECIES_TITLES[species]}</h3>
                <ul>{entry.bySpecies[species].signs.ru.map(sign => <li key={sign}>{sign}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {eaten.length > 0 && (
        <section aria-labelledby="eaten-title" className="article-section">
          <h2 id="eaten-title">Если питомец уже съел</h2>
          {sameIfEaten ? (
            <p className={`safety-lead ${entry.bySpecies.cat.ifEaten}`}><strong>{IF_EATEN_LEAD[entry.bySpecies.cat.ifEaten as keyof typeof IF_EATEN_LEAD]}</strong></p>
          ) : (
            eaten.map(species => {
              const ifEaten = entry.bySpecies[species].ifEaten as keyof typeof IF_EATEN_LEAD
              return (
                <p key={species} className={`safety-lead ${ifEaten}`}>
                  <strong>{SPECIES_TITLES[species]}: {IF_EATEN_LEAD[ifEaten]}</strong>
                </p>
              )
            })
          )}
          <h3>Что сделать сразу</h3>
          <ol className="article-list">{entry.firstSteps.ru.map(step => <li key={step}>{step}</li>)}</ol>
          <h3>Чего не делать</h3>
          <ul className="article-list">{entry.avoid.ru.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
      )}
      {toxin && (
        <p className="pair-link safety-toxin-link">
          Подробнее об отравлении: <Link href={pathOf(toxin)} className="link">{toxin.title}</Link>
        </p>
      )}

      <CheckCta title="Проверьте для своего питомца в приложении">
        <p>
          В приложении Лапка ответ учитывает анкету питомца: вид, аллергии и хронические болезни. Если того, что
          вы ищете, нет в справочнике, там можно спросить ИИ — его ответ будет помечен. А если питомцу уже плохо,
          там же можно проверить симптомы.
        </p>
      </CheckCta>
      <SourcesSection sources={entry.sources} />
    </article>
  )
}
