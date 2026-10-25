import { describe, expect, it } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { ROUTE_SLICES, coreOf, mergeSlices, sliceOf, type Namespace } from '@/shared/i18n/slices'

/**
 * The dictionary of the active language used to go whole to every page's
 * client components, medical record and all, the landing page included.
 * The core goes everywhere; the rest goes with the route group that reads it.
 */
describe('dictionary slices', () => {
  const namespaces = Object.keys(ru) as Namespace[]
  const sliced = new Set<string>(Object.values(ROUTE_SLICES).flat())

  it('keep the medical record, the pet form and the cabinet screens out of the core', () => {
    const core = coreOf(ru)
    for (const heavy of ['medicalRecord', 'followup', 'pets', 'check', 'auth', 'admin', 'deletion'] as const) {
      expect(core, heavy).not.toHaveProperty(heavy)
      expect(sliced.has(heavy), heavy).toBe(true)
    }
    // The core is what every page pays for; under a sixth of the whole.
    expect(JSON.stringify(core).length).toBeLessThan(JSON.stringify(ru).length / 6)
  })

  it('keep what every page needs in the core', () => {
    const core = coreOf(ru)
    for (const needed of ['site', 'common', 'errors', 'consent', 'urgency', 'feedback'] as const) {
      expect(core, needed).toHaveProperty(needed)
    }
  })

  it('lose no namespace between the core and the slices', () => {
    const core = new Set(Object.keys(coreOf(ru)))
    for (const name of namespaces) expect(core.has(name) || sliced.has(name), name).toBe(true)
  })

  it('cut the same slices from both languages', () => {
    for (const route of Object.keys(ROUTE_SLICES) as (keyof typeof ROUTE_SLICES)[]) {
      expect(Object.keys(sliceOf(en, route))).toEqual(Object.keys(sliceOf(ru, route)))
      expect(Object.keys(sliceOf(ru, route)).sort()).toEqual([...ROUTE_SLICES[route]].sort())
    }
  })

  it('merge a slice over what the page already has', () => {
    const merged = mergeSlices(coreOf(ru), sliceOf(ru, 'pets/[id]'))
    expect(merged.medicalRecord).toBe(ru.medicalRecord)
    expect(merged.site).toBe(ru.site)
    expect(mergeSlices(null, sliceOf(ru, 'admin')).admin).toBe(ru.admin)
  })
})
