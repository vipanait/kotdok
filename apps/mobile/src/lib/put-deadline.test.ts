import { afterEach, describe, expect, it, vi } from 'vitest'
import { PUT_TIMEOUT_MS, putWithin } from './put-deadline'

describe('a PUT with a deadline', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers as the PUT does when it finishes in time', async () => {
    expect(await putWithin(async () => true)).toBe(true)
    expect(await putWithin(async () => false)).toBe(false)
    expect(await putWithin(async () => Promise.reject(new TypeError('Network request failed')))).toBe(false)
  })

  it('gives up after two minutes, aborts the request and says it did not land', async () => {
    vi.useFakeTimers()
    let seen: AbortSignal | null = null
    const stalled = putWithin((signal) => {
      seen = signal
      return new Promise<boolean>(() => {})
    })
    await vi.advanceTimersByTimeAsync(PUT_TIMEOUT_MS - 1)
    expect(seen!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await stalled).toBe(false)
    expect(seen!.aborted).toBe(true)
  })
})
