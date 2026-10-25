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

let cache: { symptoms: SymptomPage[]; toxins: ToxinPage[] } | null = null

/** Every page in the repository, drafts included, each checked against its schema. */
export function allContent(): { symptoms: SymptomPage[]; toxins: ToxinPage[] } {
  cache ??= {
    symptoms: readAll('symptoms', parseWith<SymptomPage>(symptomPageSchema)),
    toxins: readAll('toxins', parseWith<ToxinPage>(toxinPageSchema)),
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
  const symptom = symptomPage(slug)
  if (symptom) return { href: `/simptomy/${symptom.slug}`, name: symptom.title }
  const toxin = toxinPage(slug)
  if (toxin) return { href: `/otravlenie/${toxin.slug}`, name: toxin.title }
  return undefined
}

/** The same topic for the other species, if there is a page for it. */
export function counterpart(page: SymptomPage): SymptomPage | undefined {
  return symptomPages().find(other => other.topic === page.topic && other.species !== page.species)
}
