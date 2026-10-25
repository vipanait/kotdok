import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTE_SLICES, SLICED, type Namespace } from '@/shared/i18n/slices'

/**
 * A client component reads its texts from the nearest `LocaleProvider`. The
 * root gives every page the core; a route group's layout adds the slice its
 * screens read (`<DictionarySlice route="…">`). This walks the imports of
 * every page under `(frontend)` to the client components that call
 * `useTranslations()`, and checks that what they read is provided on that
 * route — so a screen moved to another route, or a new namespace, cannot
 * reach the browser without its texts.
 */
const SRC = normalize(new URL('../../../src', import.meta.url).pathname)
const FRONTEND = join(SRC, 'app', '(frontend)')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : []
  })
}

const files = new Map(walk(SRC).map((file) => [file, readFileSync(file, 'utf8')]))

function resolve(spec: string, from: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null
  if (!base) return null
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (files.has(candidate)) return candidate
  }
  return null
}

const imports = new Map(
  [...files].map(([file, source]) => [
    file,
    [...source.matchAll(/from '([^']+)'/g)].map((m) => resolve(m[1], file)).filter((f): f is string => f !== null),
  ]),
)

/** The top-level namespaces a client file reads through `useTranslations()`. */
function namespacesRead(source: string): Set<string> {
  if (!/^'use client'/m.test(source)) return new Set()
  const read = new Set<string>()
  for (const [, name, alias] of source.matchAll(/const (\w+) = useTranslations\(\)(?:\.(\w+))?/g)) {
    if (alias) read.add(alias)
    else for (const [, ns] of source.matchAll(new RegExp(`\\b${name}\\.([a-zA-Z]+)`, 'g'))) read.add(ns)
  }
  for (const [, alias] of source.matchAll(/useTranslations\(\)\.(\w+)/g)) read.add(alias)
  return read
}

function reachable(start: string): Set<string> {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    stack.push(...(imports.get(file) ?? []))
  }
  return seen
}

/** The slices the layouts above a page provide: `<DictionarySlice route="…">` in each ancestor layout. */
function provided(page: string): Set<string> {
  const names = new Set<string>()
  for (let dir = dirname(page); dir.startsWith(FRONTEND); dir = dirname(dir)) {
    const layout = join(dir, 'layout.tsx')
    const source = files.get(layout)
    if (!source) continue
    for (const [, route] of source.matchAll(/<DictionarySlice route="([^"]+)"/g)) {
      const slice = ROUTE_SLICES[route as keyof typeof ROUTE_SLICES]
      expect(slice, `${relative(SRC, layout)} names a route without a slice: ${route}`).toBeDefined()
      for (const name of slice) names.add(name)
    }
  }
  return names
}

describe('dictionary slices by route', () => {
  const pages = walk(FRONTEND).filter((file) => /\/(page|error|not-found)\.tsx$/.test(file))

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThan(20)
  })

  it('provide every namespace a page’s client components read', () => {
    const missing: string[] = []
    for (const page of pages) {
      const has = provided(page)
      for (const file of reachable(page)) {
        for (const name of namespacesRead(files.get(file)!)) {
          if (SLICED.has(name as Namespace) && !has.has(name)) missing.push(`${relative(FRONTEND, page)} reads ${name} (${relative(SRC, file)})`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('names only slices that exist in every layout', () => {
    for (const [file, source] of files) {
      if (!file.endsWith('layout.tsx')) continue
      for (const [, route] of source.matchAll(/<DictionarySlice route="([^"]+)"/g)) {
        expect(Object.keys(ROUTE_SLICES), relative(SRC, file)).toContain(route)
      }
    }
  })
})
