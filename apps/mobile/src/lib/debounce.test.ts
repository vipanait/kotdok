import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trailing } from './debounce'

describe('trailing', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs once after the last call in a burst', () => {
    const run = vi.fn()
    const debounced = trailing(run, 500)
    debounced()
    debounced()
    vi.advanceTimersByTime(300)
    debounced()
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(499)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs again for a call after the wait', () => {
    const run = vi.fn()
    const debounced = trailing(run, 500)
    debounced()
    vi.advanceTimersByTime(500)
    debounced()
    vi.advanceTimersByTime(500)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('can be cancelled', () => {
    const run = vi.fn()
    const debounced = trailing(run, 500)
    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(1000)
    expect(run).not.toHaveBeenCalled()
  })
})
