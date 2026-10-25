import { describe, expect, it } from 'vitest'
import { PERSISTED, persisted, queryKeys, recordKeys, scoped } from './query-keys'

describe('query keys', () => {
  it('are scoped to the signed-in user first', () => {
    expect(scoped('user-1', queryKeys.overview('pet-1'))).toEqual(['user-1', 'overview', 'pet-1'])
  })

  it('name the checks of one pet under the same prefix whatever the page size', () => {
    expect(queryKeys.checks('pet-1')).toEqual(['checks', 'pet-1'])
    expect(queryKeys.checks('pet-1', 50)).toEqual(['checks', 'pet-1', 50])
    expect(queryKeys.checks(null)).toEqual(['checks', 'all'])
  })

  it('persist lists and records across a restart, not check texts or doses', () => {
    expect(persisted(['user-1', 'pets'])).toBe(true)
    expect(persisted(['user-1', 'overview', 'pet-1'])).toBe(true)
    expect(persisted(['user-1', 'me'])).toBe(true)
    expect(persisted(['user-1', 'followups'])).toBe(true)
    expect(persisted(['user-1', 'checks', 'all'])).toBe(false)
    expect(persisted(['user-1', 'check', 'c-1'])).toBe(false)
    expect(persisted(['user-1', 'doses', 'pet-1', '2026-10-25'])).toBe(false)
    expect(persisted(['user-1', 'summary', 'pet-1', '2026-10-25'])).toBe(false)
    expect(PERSISTED.has('pets')).toBe(true)
  })

  it('lists what a change to one pet’s record can move', () => {
    const keys = recordKeys('pet-1')
    expect(keys).toContainEqual(['overview', 'pet-1'])
    expect(keys).toContainEqual(['doses', 'pet-1'])
    expect(keys).toContainEqual(['summary', 'pet-1'])
    expect(keys).toContainEqual(['due'])
    expect(keys).toContainEqual(['pets'])
    // Another pet's record is not touched.
    expect(keys.some((key) => key.includes('pet-2'))).toBe(false)
  })

  it('lists every record when the pet is not known', () => {
    const keys = recordKeys(null)
    expect(keys).toContainEqual(['overview'])
    expect(keys).toContainEqual(['doses'])
    expect(keys).toContainEqual(['due'])
    expect(keys).toContainEqual(['pets'])
  })
})
