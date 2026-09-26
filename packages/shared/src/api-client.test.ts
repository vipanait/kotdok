import { describe, expect, it } from 'vitest'
import { ApiError, ApiTimeoutError, createApiClient, type AbortSignalLike, type FetchLike } from './api-client'

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

/** The runtime's abort and timers; this package compiles without DOM or Node types. */
const runtime = globalThis as unknown as {
  AbortController: new () => { signal: AbortSignalLike; abort(): void }
  setTimeout: (handler: () => void, ms: number) => unknown
}

describe('catalogue search', () => {
  it('aborts a search the caller no longer wants, without calling it a timeout', async () => {
    const urls: string[] = []
    const hang: FetchLike = (url, init) =>
      new Promise((_resolve, reject) => {
        urls.push(url)
        // As fetch does: an already aborted signal rejects at once.
        const signal = init?.signal as { aborted: boolean; addEventListener(type: string, fn: () => void): void }
        if (signal.aborted) reject(new Error('aborted'))
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const api = createApiClient({ baseUrl: BASE, fetch: hang, timeoutMs: 10_000 })
    const caller = new runtime.AbortController()

    const search = api.getCatalog('dog', 'vaccine', 'нобив', { signal: caller.signal })
    // In flight: asked, no answer yet.
    await new Promise<void>((resolve) => runtime.setTimeout(resolve, 0))
    expect(urls).toHaveLength(1)
    caller.abort()

    await expect(search).rejects.toThrow('aborted')
    await expect(search).rejects.not.toBeInstanceOf(ApiTimeoutError)
    expect(urls).toEqual([`${BASE}/api/v1/health/catalog?species=dog&kind=vaccine&q=%D0%BD%D0%BE%D0%B1%D0%B8%D0%B2`])
  })

  it('does not even ask when the caller gave up before the call', async () => {
    let aborted = false
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal as { aborted: boolean; addEventListener(type: string, fn: () => void): void }
        aborted = signal.aborted
        if (signal.aborted) reject(new Error('aborted'))
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const api = createApiClient({ baseUrl: BASE, fetch: hang })
    const caller = new runtime.AbortController()
    caller.abort()

    await expect(api.getCatalog('cat', 'vaccine', '', { signal: caller.signal })).rejects.toThrow('aborted')
    expect(aborted).toBe(true)
  })
})

describe('medical record', () => {
  it('reads the overview from the pet’s health path and validates it', async () => {
    const pet = {
      id: '11111111-1111-4111-8111-000000000002',
      species: 'dog',
      name: 'Бобик',
      breed: null,
      age_years: 5,
      weight_kg: 28,
      sex: null,
      neutered: null,
      indoor_outdoor: null,
      diet: null,
      size_class: null,
      walk_activity: null,
      allergies: [],
      vaccinated: true,
      chronic_conditions: [],
      medications: [],
      notes: null,
      created_at: '2026-05-01T10:00:00.000Z',
    }
    const seen: string[] = []
    const fetch: FetchLike = async (url) => {
      seen.push(String(url))
      return ok({ pet, writable: [] })
    }
    const api = createApiClient({ baseUrl: BASE, fetch })

    const overview = await api.getHealthOverview(pet.id)

    expect(seen).toEqual([`${BASE}/api/v1/pets/${pet.id}/health`])
    expect(overview.pet.weight_kg).toBe(28)
  })

  it('refuses a body that is not an overview', async () => {
    const fetch: FetchLike = async () => ok({ pet: null })
    const api = createApiClient({ baseUrl: BASE, fetch })

    await expect(api.getHealthOverview('x')).rejects.toThrow()
  })
})
