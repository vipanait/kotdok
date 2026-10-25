import 'server-only'

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  symptomPageSchema,
  toxinPageSchema,
  type ContentPage,
  type Species,
  type SymptomPage,
  type ToxinPage,
} from './schema'

/**
 * Reads the articles from `apps/web/content/`. Every page is prerendered, so
 * this runs at build time (and in tests); a request never reaches the disk.
 * The build runs in `apps/web`, which is what `process.cwd()` is there.
 */
const CONTENT_ROOT = join(process.cwd(), 'content')

function readAll<T>(dir: string, parse: (value: unknown, file: string) => T): T[] {
  const path = join(CONTENT_ROOT, dir)
  return readdirSync(path)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => parse(JSON.parse(readFileSync(join(path, name), 'utf8')), `${dir}/${name}`))
}

function parseWith<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { message: string } } }) {
  return (value: unknown, file: string): T => {
    const result = schema.safeParse(value)
    if (!result.success) throw new Error(`content/${file}: ${result.error.message}`)
    return result.data
  }
}

/** Keys left exactly as written: identifiers, and the texts search engines show. */
const AS_WRITTEN = new Set(['slug', 'topic', 'related', 'url', 'kind', 'locale', 'species', 'bodySystem', 'level', 'status', 'draftedBy', 'reviewedBy', 'reviewedAt', 'nextReviewAt', 'metaTitle', 'metaDescription'])

/**
 * A non-breaking space after a one- or two-letter word, so a line never ends
 * with «в» or «не» — the one typographic rule a narrow phone screen makes
 * visible on every page.
 */
export function typeset(text: string): string {
  // A lookbehind, not a group: «и не пьёт» has two short words in a row, and a
  // consumed space before the second one would leave it hanging.
  return text.replace(/(?<=^|[\s(«])([вксоуиа]|на|не|но|по|за|из|от|до|ни|же|бы|ли|при|для|без|или)\s+/gi, '$1\u00a0')
}

function typesetDeep<T>(value: T, key?: string): T {
  if (key && AS_WRITTEN.has(key)) return value
  if (typeof value === 'string') return typeset(value) as T
  if (Array.isArray(value)) return value.map(item => typesetDeep(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typesetDeep(v, k)])) as T
  }
  return value
}

let cache: { symptoms: SymptomPage[]; toxins: ToxinPage[] } | null = null

/** Every page in the repository, drafts included, each checked against its schema. */
export function allContent(): { symptoms: SymptomPage[]; toxins: ToxinPage[] } {
  cache ??= {
    symptoms: readAll('symptoms', parseWith<SymptomPage>(symptomPageSchema)).map(page => typesetDeep(page)),
    toxins: readAll('toxins', parseWith<ToxinPage>(toxinPageSchema)).map(page => typesetDeep(page)),
  }
  return cache
}

/**
 * Whether a page is on the site. Production shows published pages only; a
 * Vercel preview and the dev server show drafts too, marked and `noindex`, so
 * a text can be read in place before it is published.
 */
export function isVisible(page: ContentPage): boolean {
  if (page.review.status === 'published') return true
  return process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development'
}

export function isDraft(page: ContentPage): boolean {
  return page.review.status !== 'published'
}

/** The site path of an article: the one place the two prefixes are spelled out. */
export function pathOf(page: ContentPage): string {
  return page.kind === 'symptom' ? `/simptomy/${page.slug}` : `/otravlenie/${page.slug}`
}

/** What production shows, whatever the environment: for the sitemap. */
export function publishedPages(): ContentPage[] {
  const { symptoms, toxins } = allContent()
  return [...symptoms, ...toxins].filter(page => page.review.status === 'published')
}

export function symptomPages(species?: Species): SymptomPage[] {
  return allContent().symptoms.filter(page => isVisible(page) && (!species || page.species === species))
}

export function toxinPages(): ToxinPage[] {
  return allContent().toxins.filter(isVisible)
}

export function symptomPage(slug: string): SymptomPage | undefined {
  return symptomPages().find(page => page.slug === slug)
}

export function toxinPage(slug: string): ToxinPage | undefined {
  return toxinPages().find(page => page.slug === slug)
}

export interface PageLink {
  href: string
  name: string
}

/** Where a slug in `related` points, if that page is on the site. */
export function linkTo(slug: string): PageLink | undefined {
  const page = symptomPage(slug) ?? toxinPage(slug)
  return page && { href: pathOf(page), name: page.title }
}

/** The same topic for the other species, if there is a page for it. */
export function counterpart(page: SymptomPage): SymptomPage | undefined {
  return symptomPages().find(other => other.topic === page.topic && other.species !== page.species)
}
