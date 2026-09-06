import { describe, expect, it, vi } from 'vitest'
import { createRefreshCoordinator } from './token-refresh'

/** A promise the test resolves by hand, so several callers can pile up first. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('token refresh', () => {
  it('refreshes once when several requests fail at the same time', async () => {
    const gate = deferred<{ ok: true; accessToken: string }>()
    const refresh = vi.fn(() => gate.promise)
    const coordinator = createRefreshCoordinator({ refresh, onSessionLost: vi.fn() })

    // Three screens hit a 401 before any refresh has finished.
    const waiting = Promise.all([
      coordinator.refreshOnce(),
      coordinator.refreshOnce(),
      coordinator.refreshOnce(),
    ])
    gate.resolve({ ok: true, accessToken: 'fresh' })

    await expect(waiting).resolves.toEqual(['fresh', 'fresh', 'fresh'])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(coordinator.refreshCount).toBe(1)
  })

  it('refreshes again the next time the token expires', async () => {
    const refresh = vi.fn(async () => ({ ok: true as const, accessToken: 'fresh' }))
    const coordinator = createRefreshCoordinator({ refresh, onSessionLost: vi.fn() })

    await coordinator.refreshOnce()
    await coordinator.refreshOnce()

    expect(coordinator.refreshCount).toBe(2)
  })

  it('signs out once when the session is gone', async () => {
    const onSessionLost = vi.fn()
    const gate = deferred<{ ok: false }>()
    const coordinator = createRefreshCoordinator({ refresh: () => gate.promise, onSessionLost })

    const waiting = Promise.all([coordinator.refreshOnce(), coordinator.refreshOnce()])
    gate.resolve({ ok: false })

    await expect(waiting).resolves.toEqual([null, null])
    expect(onSessionLost).toHaveBeenCalledTimes(1)
  })

  it('treats a thrown refresh as a lost session, not a crash', async () => {
    const onSessionLost = vi.fn()
    const coordinator = createRefreshCoordinator({
      refresh: async () => {
        throw new Error('network down')
      },
      onSessionLost,
    })

    await expect(coordinator.refreshOnce()).resolves.toBeNull()
    expect(onSessionLost).toHaveBeenCalledTimes(1)
  })
})
