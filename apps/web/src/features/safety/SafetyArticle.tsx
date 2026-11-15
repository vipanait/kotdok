import Link from 'next/link'
import { breadcrumbJsonLd, type Crumb } from '@/features/seo-content/components/ArticleFrame'
import { pathOf, toxinPage } from '@/features/seo-content/load'
import { safetyPath } from '@/shared/content-paths'
import { siteUrl } from '@/shared/seo'
import { jsonLdScript } from '@/shared/site-metadata'
import SafetyAppCta from './SafetyAppCta'
import SafetyFootnote, { safetyAboutHref } from './SafetyFootnote'
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

/** Who an «Если питомец уже съел» lead is for: one line when the advice is the same, one per species when it is not. */
const IF_EATEN_FOR = { cat: 'Для кошек', dog: 'Для собак', both: 'Для кошек и собак' } as const
const SIGNS_TITLES = { cat: 'Признаки у кошек', dog: 'Признаки у собак' } as const

/**
 * The page in the design's order (handoff §6): the two verdicts, then what to
 * do if the pet has already eaten it — before the long explanation, so the
 * urgent instruction is seen first — then why and the signs. Sources and the
 * way into the app sit in a right column on a wide screen and follow the
 * text on a phone. The long byline is the one short footnote (§8); a draft
 * keeps its mark.
 */
export default function SafetyArticle({ entry }: { entry: SafetyEntry }) {
  const draft = entry.review.status !== 'published'
  const toxin = entry.toxinSlug ? toxinPage(entry.toxinSlug) : undefined
  // `none` is «nothing to do»: that species gets no block.
  const eaten = SPECIES.filter(species => entry.bySpecies[species].ifEaten !== 'none')
  const sameIfEaten = eaten.length === 2 && entry.bySpecies.cat.ifEaten === entry.bySpecies.dog.ifEaten
  const callNow = eaten.some(species => entry.bySpecies[species].ifEaten === 'call_now')
  const withSigns = SPECIES.filter(species => entry.bySpecies[species].signs.ru.length > 0)
  const toxinLink = toxin && (
    <p className="safety-toxin-link">
      Подробнее об отравлении: <Link href={pathOf(toxin)} className="link">{toxin.title}</Link>
    </p>
  )

  return (
    <article className="safety-article">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            '@context': 'https://schema.org',
            '@graph': [safetyFaqJsonLd(entry), breadcrumbJsonLd(siteUrl, safetyCrumbs(entry))],
          }),
        }}
      />
      <Link href="/mozhno-li" className="safety-back"><span aria-hidden="true">←</span> Можно ли питомцу</Link>
      <header>
        <div className="eyebrow">{SAFETY_CATEGORY_TITLES[entry.category]} · Справочник</div>
        <h1>{safetyHeading(entry)}</h1>
        {draft && (
          <p className="safety-draft">
            <strong className="draft-mark">Черновик: страница ещё не опубликована.</strong>
          </p>
        )}
      </header>

      <div className="safety-verdicts">
        {SPECIES.map(species => {
          const part = entry.bySpecies[species]
          const view = verdictView(entry.category, part.verdict)
          return (
            <div key={species} className={`safety-verdict ${view.tone}`}>
              <p className="safety-verdict-who">{SPECIES_DATIVE[species]}</p>
              <p className="safety-verdict-label">{view.label}</p>
              <p className="safety-verdict-summary">{part.summary.ru}</p>
            </div>
          )
        })}
      </div>
      {entry.category === 'medicine' && <p className="safety-medicine-line"><strong>{MEDICINE_LINE}</strong></p>}

      <div className="safety-columns">
        <div className="safety-main">
          {eaten.length > 0 && (
            <section aria-labelledby="eaten-title" className={callNow ? 'safety-block safety-eaten call-now' : 'safety-block safety-eaten'}>
              <h2 id="eaten-title">Если питомец уже съел</h2>
              {sameIfEaten ? (
                <div className={`safety-lead ${entry.bySpecies.cat.ifEaten}`}>
                  <p className="safety-for">{IF_EATEN_FOR.both}</p>
                  <p><strong>{IF_EATEN_LEAD[entry.bySpecies.cat.ifEaten as keyof typeof IF_EATEN_LEAD]}</strong></p>
                </div>
              ) : (
                // Different advice per species (or none for one): each block says whom it is for, never merged.
                eaten.map(species => {
                  const ifEaten = entry.bySpecies[species].ifEaten as keyof typeof IF_EATEN_LEAD
                  return (
                    <div key={species} className={`safety-lead ${ifEaten}`} data-species={species}>
                      <p className="safety-for">{IF_EATEN_FOR[species]}</p>
                      <p><strong>{IF_EATEN_LEAD[ifEaten]}</strong></p>
                    </div>
                  )
                })
              )}
              <h3>Что сделать сразу</h3>
              <ol className="article-list">{entry.firstSteps.ru.map(step => <li key={step}>{step}</li>)}</ol>
              <h3>Чего не делать</h3>
              <ul className="article-list">{entry.avoid.ru.map(item => <li key={item}>{item}</li>)}</ul>
              {toxinLink}
            </section>
          )}
          {eaten.length === 0 && toxinLink}

          <section aria-labelledby="why-title" className="safety-block">
            <h2 id="why-title">Почему</h2>
            {SPECIES.map(species => (
              <div key={species} className="safety-why">
                <h3>{SPECIES_TITLES[species]}</h3>
                <p>{entry.bySpecies[species].why.ru}</p>
              </div>
            ))}
          </section>

          {withSigns.map(species => (
            <section key={species} aria-labelledby={`signs-${species}-title`} className="safety-block">
              <h2 id={`signs-${species}-title`}>{SIGNS_TITLES[species]}</h2>
              <ul className="article-list">{entry.bySpecies[species].signs.ru.map(sign => <li key={sign}>{sign}</li>)}</ul>
            </section>
          ))}
        </div>

        <aside className="safety-aside" aria-label="Источники и приложение">
          <section aria-labelledby="sources-title" className="safety-block safety-sources">
            <h2 id="sources-title">Источники</h2>
            <ul>
              {entry.sources.map(source => (
                <li key={source.title}>
                  {source.url ? <a href={source.url} rel="noopener">{source.title} <span aria-hidden="true">↗</span></a> : source.title}
                </li>
              ))}
            </ul>
            <Link href={safetyAboutHref()} className="safety-about-link">Как подготовлен материал</Link>
          </section>
          <SafetyAppCta title="Проверьте для своего питомца" layout="aside">
            <p>
              В приложении — ответ для вида вашего питомца с напоминанием об аллергии и хронических болезнях из
              анкеты; ответы ИИ помечены.
            </p>
          </SafetyAppCta>
        </aside>
      </div>
      <SafetyFootnote />
    </article>
  )
}
