import 'server-only'

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SafetyIndexItem } from '@lapka/shared'
import { typeset } from '@/features/seo-content/load'
import type { Locale } from '@/shared/i18n/config'
import { safetyEntrySchema, type SafetyEntry } from './schema'

/**
 * Reads the «Можно ли» reference from `apps/web/content/safety/`, the same
 * way seo-content/load.ts reads the articles. The pages prerender it and the
 * API routes read it at runtime; `process.cwd()` is `apps/web` in both.
 */
const CONTENT_ROOT = join(process.cwd(), 'content')
const DIR = 'safety'

/**
 * Russian prose gets non-breaking spaces after short words. Aliases stay as
 * written: they are search terms, not text on a screen.
 */
function typesetRu(entry: SafetyEntry): SafetyEntry {
  const walk = <T>(value: T, key?: string): T => {
    if (key === 'aliases' || key === 'sources' || key === 'review' || key === 'en') return value
    if (key === 'ru') return typesetText(value)
    if (Array.isArray(value)) return value.map(item => walk(item)) as T
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)])) as T
    }
    return value
  }
  return walk(entry)
}

function typesetText<T>(value: T): T {
  if (typeof value === 'string') return typeset(value) as T
  if (Array.isArray(value)) return value.map(item => typesetText(item)) as T
  return value
}

let cache: SafetyEntry[] | null = null

/** Every entry in the repository, drafts included; a file that fails the schema throws with its name. */
export function allEntries(): SafetyEntry[] {
  cache ??= readdirSync(join(CONTENT_ROOT, DIR))
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const result = safetyEntrySchema.safeParse(JSON.parse(readFileSync(join(CONTENT_ROOT, DIR, name), 'utf8')))
      if (!result.success) throw new Error(`content/${DIR}/${name}: ${result.error.message}`)
      return typesetRu(result.data)
    })
  return cache
}

/**
 * The same rule as `isVisible` for the articles: production shows published
 * entries only, a Vercel preview and the dev server show drafts too.
 */
function isVisible(entry: SafetyEntry): boolean {
  if (entry.review.status === 'published') return true
  return process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development'
}

export function visibleEntries(): SafetyEntry[] {
  return allEntries().filter(isVisible)
}

/** What production shows, whatever the environment: for the sitemap. */
export function publishedEntries(): SafetyEntry[] {
  return allEntries().filter(entry => entry.review.status === 'published')
}

export function entryBySlug(slug: string): SafetyEntry | undefined {
  return visibleEntries().find(entry => entry.slug === slug)
}

/** The light list the search runs on, in one language: for the API and the site hub. */
export function safetyIndex(locale: Locale): SafetyIndexItem[] {
  return visibleEntries().map(entry => ({
    slug: entry.slug,
    category: entry.category,
    name: entry.name[locale],
    aliases: entry.aliases[locale],
    verdict: { cat: entry.bySpecies.cat.verdict, dog: entry.bySpecies.dog.verdict },
  }))
}
