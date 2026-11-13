import type { CheckSource, Locale } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'

export type SourceLine = { title: string; caption: string; url: string }

/**
 * The sources of a result as lines to read (SRC-01): the article's own title,
 * and under it who published it. An article in another language than the
 * result says so — the title is the publisher's and stays as it is.
 */
export function sourceLines(t: Dictionary, sources: CheckSource[], locale: Locale): SourceLine[] {
  return sources.map((source) => ({
    title: source.title,
    caption:
      source.lang === locale ? source.publisher : `${source.publisher} · ${t.result.sourceInEnglish}`,
    url: source.url,
  }))
}
