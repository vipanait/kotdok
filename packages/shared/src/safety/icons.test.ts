import { describe, expect, it } from 'vitest'
import { SAFETY_CATEGORIES } from '@lapka/contracts'
import { SAFETY_ICON_NAMES, safetyCategoryIcon, safetyIconFor } from './icons'

/**
 * The «Можно ли» item pictures (docs/design/pet-safety-v1/implementation-handoff.md, §5):
 * a handful of entries have a picture of their own, everything else shows its
 * category's. The picture says what the thing is, never whether it is safe.
 */
describe('safetyIconFor', () => {
  it('gives the entries the design drew a picture of their own picture', () => {
    expect(safetyIconFor('shokolad', 'food')).toBe('chocolate')
    expect(safetyIconFor('vinograd', 'food')).toBe('grapes')
    expect(safetyIconFor('moloko', 'food')).toBe('milk')
    expect(safetyIconFor('liliya', 'plant')).toBe('flower')
    expect(safetyIconFor('ibuprofen', 'medicine')).toBe('pills')
    expect(safetyIconFor('paracetamol', 'medicine')).toBe('medicine')
    expect(safetyIconFor('yabloko', 'food')).toBe('apple')
  })

  it('falls back to the category picture for any other slug', () => {
    expect(safetyIconFor('banan', 'food')).toBe('apple')
    expect(safetyIconFor('hlorofitum', 'plant')).toBe('plant')
    expect(safetyIconFor('aspirin', 'medicine')).toBe('medicine')
    expect(safetyIconFor('antifriz', 'household')).toBe('household')
    expect(safetyIconFor('constructor', 'food')).toBe('apple')
  })

  it('names only pictures that exist', () => {
    for (const category of SAFETY_CATEGORIES) {
      expect(SAFETY_ICON_NAMES).toContain(safetyCategoryIcon(category))
      expect(SAFETY_ICON_NAMES).toContain(safetyIconFor('no-such-entry', category))
    }
    expect([...SAFETY_ICON_NAMES].sort()).toEqual(
      ['apple', 'chocolate', 'flower', 'grapes', 'household', 'medicine', 'milk', 'pills', 'plant'],
    )
  })
})

describe('safetyCategoryIcon', () => {
  it('draws each category with its own picture', () => {
    expect(safetyCategoryIcon('food')).toBe('apple')
    expect(safetyCategoryIcon('plant')).toBe('plant')
    expect(safetyCategoryIcon('medicine')).toBe('medicine')
    expect(safetyCategoryIcon('household')).toBe('household')
  })
})
