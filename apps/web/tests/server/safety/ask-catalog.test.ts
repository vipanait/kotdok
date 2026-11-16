import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { askSafety, catalogSlug } from '@/server/safety/ask-safety'

/**
 * The reference wins only when the query names its entry: by name or by an
 * alias. A one-letter typo is a suggestion on the phone and on the hub, never
 * a diversion here — «баран» is not a banana.
 */
describe('catalogSlug', () => {
  // The entries are drafts until the owner publishes them; the dev server shows drafts.
  beforeAll(() => vi.stubEnv('NODE_ENV', 'development'))
  afterAll(() => vi.unstubAllEnvs())

  it('finds an entry by its name or an alias, in either language', () => {
    expect(catalogSlug(['банан'])).toBe('banan')
    expect(catalogSlug(['Бананы'])).toBe('banan')
    expect(catalogSlug(['ripe banana'])).toBe('banan')
  })

  it('does not divert a typo-distance word to the reference', () => {
    expect(catalogSlug(['баран'])).toBeNull()
    expect(catalogSlug(['бананн'])).toBeNull()
  })

  it('skips empty names', () => {
    expect(catalogSlug(['', 'банан'])).toBe('banan')
  })
})

describe('askSafety', () => {
  it('answers «bad request» without a species or with a query of no letters, before touching the database', async () => {
    const supabase = new Proxy({}, { get: () => { throw new Error('the database must not be touched') } }) as never
    expect(await askSafety(supabase, { userId: 'u', query: 'банан', locale: 'ru' })).toEqual({ ok: false, code: 'bad_request' })
    expect(await askSafety(supabase, { userId: 'u', query: '!!!', species: 'dog', locale: 'ru' })).toEqual({ ok: false, code: 'bad_request' })
  })
})
