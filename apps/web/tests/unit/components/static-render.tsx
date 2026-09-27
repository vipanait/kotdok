import type { ReactElement, ReactNode } from 'react'
import { isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleProvider } from '@/components/LocaleProvider'
import type { Locale } from '@/shared/i18n/config'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'

/**
 * The smallest component test this repository can run without a DOM: the
 * web workspace has no jsdom or Testing Library (and none in the lockfile),
 * so a component is rendered with React's own server renderer — hooks,
 * context, `useId` and all, effects excepted — and its markup is read as
 * the browser would get it on the first paint. What a component does on a
 * click or a key is tested on the pure logic it calls (the `*-form.ts`,
 * `*-view.ts` modules); a component without hooks can be called directly
 * and its element tree walked (`elements`).
 */

export function render(ui: ReactNode, locale: Locale = 'ru'): string {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale} dict={locale === 'ru' ? ru : en}>
      {ui}
    </LocaleProvider>,
  )
}

export type Tag = { name: string; attrs: Record<string, string>; text: string }

const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'col'])

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Every element of a tag name in the markup, with its attributes and its
 * text (tags inside it stripped). Enough for the flat forms tested here;
 * not an HTML parser.
 */
export function tags(html: string, name: string): Tag[] {
  const found: Tag[] = []
  const open = new RegExp(`<${name}\\b([^>]*)>`, 'g')
  for (let match = open.exec(html); match; match = open.exec(html)) {
    const attrs: Record<string, string> = {}
    for (const attr of match[1].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[attr[1].toLowerCase()] = decode(attr[2] ?? '')
    let text = ''
    if (!VOID.has(name)) {
      const close = html.indexOf(`</${name}>`, open.lastIndex)
      text = close === -1 ? '' : decode(html.slice(open.lastIndex, close).replace(/<[^>]+>/g, ''))
    }
    found.push({ name, attrs, text })
  }
  return found
}

/** The one element of a tag whose attribute or text matches; fails loudly when there is not exactly one. */
export function tag(html: string, name: string, match: (tag: Tag) => boolean): Tag {
  const found = tags(html, name).filter(match)
  if (found.length !== 1) throw new Error(`expected one <${name}>, found ${found.length}`)
  return found[0]
}

/**
 * The host elements of a React element tree, depth first, without rendering:
 * for a component that has no hooks, called as a function. Components inside
 * it are not expanded — the tree is what this component itself draws.
 */
export function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = []
  const visit = (value: ReactNode) => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (isValidElement<Record<string, unknown>>(value)) {
      found.push(value)
      visit(value.props.children as ReactNode)
    }
  }
  visit(node)
  return found
}
