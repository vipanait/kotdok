import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Services take a verified user context and return plain data. HTTP, cookies
 * and cache revalidation live in adapters, and nothing under src/server may
 * depend on a screen — otherwise the API contract ends up defined by the web UI,
 * which is exactly what stage 1 is undoing.
 */

const SERVER_ROOT = new URL('../../../src/server', import.meta.url).pathname

const FORBIDDEN = [
  { pattern: /from 'next\/server'/, reason: 'NextRequest/NextResponse' },
  { pattern: /from 'next\/navigation'/, reason: 'redirect' },
  { pattern: /from 'next\/headers'/, reason: 'cookies' },
  { pattern: /from 'next\/cache'/, reason: 'revalidatePath' },
  { pattern: /from '@\/features\//, reason: 'a screen' },
  { pattern: /from '@\/app\//, reason: 'a route' },
  { pattern: /from '@\/components\//, reason: 'a component' },
]

/**
 * Adapters are allowed to touch the framework — that is their job. Everything
 * else under src/server must not. Adding a file here is a decision, which is
 * why the list is explicit rather than a glob.
 */
const ADAPTERS = new Set([
  'api/bearer-auth.ts',
  'api/failure-response.ts',
  'api/response.ts',
  'api/with-api-auth.ts',
  'auth/auth-callback.ts',
  'auth/get-auth-user.ts',
  'auth/sign-out.ts',
  'billing/billing-disabled.ts',
  'i18n/get-locale.ts',
  'pets/pet-http.ts',
  'security/csrf.ts',
  'supabase/server.ts',
  'symptom-check/symptom-check-http.ts',
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

describe('service layer boundaries', () => {
  const files = sourceFiles(SERVER_ROOT)

  it('finds the server modules', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('keeps the framework out of everything that is not an adapter', () => {
    const violations: string[] = []

    for (const file of files) {
      const name = relative(SERVER_ROOT, file)
      if (ADAPTERS.has(name)) continue

      const source = readFileSync(file, 'utf8')
      for (const { pattern, reason } of FORBIDDEN) {
        if (pattern.test(source)) violations.push(`${name} imports ${reason}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('lists only files that exist as adapters', () => {
    const names = new Set(files.map((file) => relative(SERVER_ROOT, file)))

    for (const adapter of ADAPTERS) expect(names.has(adapter), `${adapter} is gone`).toBe(true)
  })
})
