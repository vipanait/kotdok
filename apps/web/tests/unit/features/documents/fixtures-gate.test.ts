import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { uiFixturesEnabled } from '@/app/(frontend)/dev/documents-states/gate'

// Ruling R1: the recognition fixtures preview exists only with LAPKA_UI_FIXTURES=1.
describe('the /dev/documents-states gate', () => {
  it('is closed without the env, or with any other value', () => {
    expect(uiFixturesEnabled({})).toBe(false)
    expect(uiFixturesEnabled({ LAPKA_UI_FIXTURES: '0' })).toBe(false)
    expect(uiFixturesEnabled({ LAPKA_UI_FIXTURES: 'true' })).toBe(false)
    expect(uiFixturesEnabled({ LAPKA_UI_FIXTURES: ' 1' })).toBe(false)
  })

  it('opens only with LAPKA_UI_FIXTURES=1', () => {
    expect(uiFixturesEnabled({ LAPKA_UI_FIXTURES: '1' })).toBe(true)
  })

  it('the page answers 404 before anything else when the gate is closed, at request time', () => {
    const page = readFileSync(new URL('../../../../src/app/(frontend)/dev/documents-states/page.tsx', import.meta.url), 'utf8')
    const connection = page.indexOf('await connection()')
    const gate = page.indexOf('if (!uiFixturesEnabled()) notFound()')
    const cabinet = page.indexOf('await requireCabinet(')
    expect(connection).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(connection)
    expect(cabinet).toBeGreaterThan(gate)
  })

  it('the real stored-document screen passes no recognition offer (ruling R2)', () => {
    const page = readFileSync(new URL('../../../../src/app/(frontend)/pets/[id]/(pet)/documents/[docId]/page.tsx', import.meta.url), 'utf8')
    expect(page).not.toContain('recognitionOffer')
  })
})
