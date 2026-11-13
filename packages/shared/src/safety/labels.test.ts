import { describe, expect, it } from 'vitest'
import { verdictLabelKey } from './labels'

describe('verdictLabelKey', () => {
  it('names a verdict by what the category asks', () => {
    expect(verdictLabelKey('food', 'safe')).toBe('can')
    expect(verdictLabelKey('food', 'caution')).toBe('caution')
    expect(verdictLabelKey('food', 'danger')).toBe('cannot')
    expect(verdictLabelKey('plant', 'safe')).toBe('nonToxic')
    expect(verdictLabelKey('plant', 'caution')).toBe('caution')
    expect(verdictLabelKey('plant', 'danger')).toBe('dangerous')
    expect(verdictLabelKey('household', 'caution')).toBe('lowRisk')
    expect(verdictLabelKey('household', 'danger')).toBe('dangerous')
    expect(verdictLabelKey('medicine', 'danger')).toBe('dangerous')
  })

  it('reads a combination the schema forbids the strict way, not the soft one', () => {
    expect(verdictLabelKey('medicine', 'caution')).toBe('dangerous')
    expect(verdictLabelKey('medicine', 'safe')).toBe('dangerous')
    expect(verdictLabelKey('household', 'safe')).toBe('lowRisk')
  })

  it('says «no data» for an unknown verdict in any category', () => {
    expect(verdictLabelKey('food', 'unknown')).toBe('noData')
    expect(verdictLabelKey('medicine', 'unknown')).toBe('noData')
  })
})
