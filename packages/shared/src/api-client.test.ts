import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError, createApiClient, type FetchLike } from './api-client'

const BASE = 'https://example.test'

/** A response shaped the way the client reads one. */
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

describe('api client deadline', () => {
  it('gives up on a server that never answers', async () => {
    // Never resolving, but abortable — a stalled server, not a refused one.
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal as { addEventListener(type: string, fn: () => void): void }
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })

    const api = createApiClient({ baseUrl: BASE, fetch: hang, timeoutMs: 50 })

    await expect(api.listPets()).rejects.toBeInstanceOf(ApiTimeoutError)
  })

  it('names the path and the deadline, so a log says which call stalled', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal as { addEventListener(type: string, fn: () => void): void }
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })

    const api = createApiClient({ baseUrl: BASE, fetch: hang, timeoutMs: 40 })

    await expect(api.listPets()).rejects.toMatchObject({ path: '/pets', afterMs: 40 })
  })

  it('keeps an ordinary network failure distinct from a timeout', async () => {
    // Both leave the caller without an answer, but only one is worth waiting
    // longer for, and only one means the request may still be running.
    const refuse: FetchLike = () => Promise.reject(new Error('connection refused'))
    const api = createApiClient({ baseUrl: BASE, fetch: refuse, timeoutMs: 50 })

    await expect(api.listPets()).rejects.not.toBeInstanceOf(ApiTimeoutError)
  })

  it('lets a slow answer through as long as it beats the deadline', async () => {
    // The risk this guards is the opposite one: a deadline that fires on a
    // response already on its way turns a working call into a failure.
    // Deferred over many microtasks rather than a real timer: this package has
    // no Node or DOM types, and the point is only that the answer arrives after
    // the deadline was armed.
    const slow: FetchLike = async () => {
      for (let tick = 0; tick < 100; tick += 1) await Promise.resolve()
      return ok([])
    }

    const api = createApiClient({ baseUrl: BASE, fetch: slow, timeoutMs: 300 })

    await expect(api.listPets()).resolves.toEqual([])
  })

  it('still turns a server error envelope into a typed error', async () => {
    const failing: FetchLike = () =>
      Promise.resolve({
        ok: false,
        status: 402,
        json: async () => ({
          error: { code: 'insufficient_credits', message: 'no credits', request_id: 'r1' },
        }),
      })

    const api = createApiClient({ baseUrl: BASE, fetch: failing })

    await expect(api.listPets()).rejects.toBeInstanceOf(ApiError)
  })
})
