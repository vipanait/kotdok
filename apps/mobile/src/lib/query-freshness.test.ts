import { describe, expect, it } from 'vitest'
import { STALE_MS, needsRefetch } from './query-freshness'

const now = 1_000_000

describe('needsRefetch', () => {
  it('is true for a query never answered', () => {
    expect(needsRefetch(undefined, now)).toBe(true)
    expect(needsRefetch({ dataUpdatedAt: 0, isInvalidated: false }, now)).toBe(true)
  })

  it('is false while the answer is fresh', () => {
    expect(needsRefetch({ dataUpdatedAt: now - STALE_MS + 1, isInvalidated: false }, now)).toBe(false)
  })

  it('is true once the answer is older than the stale time', () => {
    expect(needsRefetch({ dataUpdatedAt: now - STALE_MS, isInvalidated: false }, now)).toBe(true)
  })

  it('is true for an answer a save has invalidated, however fresh', () => {
    expect(needsRefetch({ dataUpdatedAt: now, isInvalidated: true }, now)).toBe(true)
  })
})
