import { describe, expect, it } from 'vitest'
import { devStatesEnabled } from './gate'

describe('the recognition states preview', () => {
  it('opens only in a development build', () => {
    expect(devStatesEnabled(true)).toBe(true)
    expect(devStatesEnabled(false)).toBe(false)
  })

  it('stays closed where __DEV__ is not defined', () => {
    // Vitest runs outside React Native: no __DEV__, as in a stripped release bundle.
    expect(typeof (globalThis as { __DEV__?: unknown }).__DEV__).toBe('undefined')
    expect(devStatesEnabled()).toBe(false)
    expect(devStatesEnabled(undefined)).toBe(false)
  })
})
