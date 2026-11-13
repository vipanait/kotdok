import { checkSources } from '@lapka/shared'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

interface Props {
  /** The check's `full_response`; the sources are a key inside it. */
  fullResponse: Record<string, unknown> | null
  dict: Dictionary
  /** The page's language: the block reads as the headings around it do. */
  locale: Locale
}

/**
 * The materials of the vet knowledge base the analysis relied on (SRC-01).
 *
 * Titles and publishers only, each a link to the original in a new tab:
 * nothing of the articles themselves is shown. The note under the list is
 * there so that a publisher's name next to the answer is not read as its
 * endorsement. A check without sources — an older one, or one the search
 * found nothing for — draws nothing.
 */
export default function CheckSources({ fullResponse, dict, locale }: Props) {
  const t = dict.check
  const sources = checkSources(fullResponse)
  if (sources.length === 0) return null

  return (
    <div className="result-sources">
      <h3>{t.sourcesTitle}</h3>
      <ul>
        {sources.map(source => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" lang={source.lang}>
              {source.title}
            </a>
            <span className="small">
              {source.lang === locale ? source.publisher : `${source.publisher} · ${t.sourceInEnglish}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="footnote">{t.sourcesNote}</p>
    </div>
  )
}
