import { describe, expect, it } from 'vitest'
import { isKnownErrorCode } from '@lapka/contracts'
import { ApiError, ApiTimeoutError, createApiClient, isKeyReused, type AbortSignalLike, type FetchLike } from './api-client'

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

describe('consent calls', () => {
  it('reads the status and sends consent', async () => {
    const seen: Array<[string, string]> = []
    const answers = [
      ok({ required: true, version: '2026-09-26' }),
      { ok: true, status: 204, json: async () => null },
    ]
    const record: FetchLike = async (url, init) => {
      seen.push([init?.method ?? 'GET', String(url)])
      return answers.shift()!
    }
    const api = createApiClient({ baseUrl: BASE, fetch: record })

    await expect(api.getConsentStatus()).resolves.toEqual({ required: true, version: '2026-09-26' })
    await expect(api.giveConsent({ version: '2026-09-26', source: 'ios' })).resolves.toBeUndefined()
    expect(seen).toEqual([
      ['GET', `${BASE}/api/v1/consent`],
      ['POST', `${BASE}/api/v1/consent`],
    ])
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

describe('summary for the vet', () => {
  it('sends the owner’s day when given, and nothing when not (an older caller)', async () => {
    const seen: string[] = []
    const fetch: FetchLike = async (url) => {
      seen.push(String(url))
      // Any body: only the address matters here.
      return ok({})
    }
    const api = createApiClient({ baseUrl: BASE, fetch })
    const pet = '11111111-1111-4111-8111-000000000001'

    await api.getVetSummary(pet, '2026-09-27').catch(() => null)
    await api.getVetSummary(pet).catch(() => null)

    expect(seen).toEqual([`${BASE}/api/v1/pets/${pet}/health/summary?today=2026-09-27`, `${BASE}/api/v1/pets/${pet}/health/summary`])
  })
})

describe('MW-09 additions', () => {
  const pet = '11111111-1111-4111-8111-000000000001'
  const course = '11111111-1111-4111-8111-000000000002'
  const weight = '11111111-1111-4111-8111-000000000003'

  it('sends a weight save’s key when given, and no header when not (an older caller)', async () => {
    const seen: Array<Record<string, string>> = []
    const fetch: FetchLike = async (_url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) })
      return ok({})
    }
    const api = createApiClient({ baseUrl: BASE, fetch })
    const body = { measured_on: '2026-09-27', weight_kg: 4.2 }

    await api.addWeight(pet, body, 'key-12345678').catch(() => null)
    await api.addWeight(pet, body).catch(() => null)
    await api.changeWeight(pet, weight, { weight_kg: 4.3 }, 'key-87654321').catch(() => null)

    expect(seen[0]['Idempotency-Key']).toBe('key-12345678')
    expect(seen[1]['Idempotency-Key']).toBeUndefined()
    expect(seen[2]['Idempotency-Key']).toBe('key-87654321')
  })

  it('sends the owner’s day with a course change when given', async () => {
    const seen: string[] = []
    const fetch: FetchLike = async (url) => {
      seen.push(String(url))
      return ok({})
    }
    const api = createApiClient({ baseUrl: BASE, fetch })

    await api.changeMedication(pet, course, { dosage: 'утром' }, '2026-09-27').catch(() => null)
    await api.changeMedication(pet, course, { dosage: 'утром' }).catch(() => null)

    expect(seen).toEqual([
      `${BASE}/api/v1/pets/${pet}/health/medications/${course}?today=2026-09-27`,
      `${BASE}/api/v1/pets/${pet}/health/medications/${course}`,
    ])
  })

  it('tells a reused key from any other conflict', () => {
    expect(isKeyReused(new ApiError('conflict', 409, 'x', 'r', { reason: 'idempotency_key_reused' }))).toBe(true)
    // A weight's day already taken: the same code, no such reason.
    expect(isKeyReused(new ApiError('conflict', 409, 'x', 'r'))).toBe(false)
    expect(isKeyReused(new ApiError('record_done', 409, 'x', 'r', { reason: 'idempotency_key_reused' }))).toBe(false)
    expect(isKeyReused(new Error('conflict'))).toBe(false)
  })
})

describe('MW-09 Task 2: the owner’s day on the reads and writes that count the pet form’s medicines', () => {
  const pet = '11111111-1111-4111-8111-000000000001'
  const course = '11111111-1111-4111-8111-000000000002'
  const visit = '11111111-1111-4111-8111-000000000003'
  const item = '11111111-1111-4111-8111-000000000004'

  it('puts `today` in the query when given, and leaves the address as it was when not (an older caller)', async () => {
    const seen: string[] = []
    const fetch: FetchLike = async (url, init) => {
      seen.push(`${init?.method ?? 'GET'} ${String(url)}`)
      return ok({})
    }
    const api = createApiClient({ baseUrl: BASE, fetch })
    const day = '2026-09-27'
    const visitBody = { status: 'planned', date: day, visit_kind: 'checkup' } as const

    await api.getHealthOverview(pet, day).catch(() => null)
    await api.getHealthOverview(pet).catch(() => null)
    await api.addMedications(pet, { items: [{ name: 'Мильпразон' }] }, 'key-12345678', day).catch(() => null)
    await api.deleteMedication(pet, course, day).catch(() => null)
    await api.createVisit(pet, visitBody, 'key-12345678', day).catch(() => null)
    await api.changeVisit(pet, visit, { clinic: 'Айболит' }, 'key-12345678', day).catch(() => null)
    await api.changeVisit(pet, visit, { clinic: 'Айболит' }).catch(() => null)
    await api.prescriptionToMedication(pet, item, day).catch(() => null)
    await api.createCheck('key-12345678', { symptoms: 'Не ест второй день' }, day).catch(() => null)
    await api.createCheck('key-12345678', { symptoms: 'Не ест второй день' }).catch(() => null)

    expect(seen).toEqual([
      `GET ${BASE}/api/v1/pets/${pet}/health?today=${day}`,
      `GET ${BASE}/api/v1/pets/${pet}/health`,
      `POST ${BASE}/api/v1/pets/${pet}/health/medications?today=${day}`,
      `DELETE ${BASE}/api/v1/pets/${pet}/health/medications/${course}?today=${day}`,
      `POST ${BASE}/api/v1/pets/${pet}/health/visits?today=${day}`,
      `PATCH ${BASE}/api/v1/pets/${pet}/health/visits/${visit}?today=${day}`,
      `PATCH ${BASE}/api/v1/pets/${pet}/health/visits/${visit}`,
      `POST ${BASE}/api/v1/pets/${pet}/health/items/${item}/medication?today=${day}`,
      `POST ${BASE}/api/v1/checks?today=${day}`,
      `POST ${BASE}/api/v1/checks`,
    ])
  })
})

describe('MW-09 Task 2: an error the client does not know', () => {
  const failing = (status: number, body: unknown): FetchLike => async () => ({ ok: false, status, json: async () => body })

  it('keeps a code a later server added, with its status and message, instead of internal_error', async () => {
    const api = createApiClient({
      baseUrl: BASE,
      fetch: failing(423, { error: { code: 'record_locked', message: 'Locked by the clinic', request_id: 'r9' } }),
    })
    const error = await api.listPets().catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'record_locked', status: 423, message: 'Locked by the clinic', requestId: 'r9' })
  })

  it('reads an envelope with a field this build does not know, or without a request id', async () => {
    const extra = createApiClient({
      baseUrl: BASE,
      fetch: failing(409, { error: { code: 'conflict', message: 'taken', request_id: 'r1', hint: 'new field' }, trace: 'x' }),
    })
    await expect(extra.listPets()).rejects.toMatchObject({ code: 'conflict', status: 409, message: 'taken', requestId: 'r1' })

    const bare = createApiClient({ baseUrl: BASE, fetch: failing(503, { error: { code: 'maintenance' } }) })
    const error = await bare.listPets().catch((cause: unknown) => cause)
    expect(error).toMatchObject({ code: 'maintenance', status: 503, requestId: null })
    expect((error as ApiError).message).toContain('503')
  })

  it('still switches on the codes it knows as before', async () => {
    const known = createApiClient({
      baseUrl: BASE,
      fetch: failing(409, { error: { code: 'record_done', message: 'done', request_id: 'r2' } }),
    })
    const error = (await known.listPets().catch((cause: unknown) => cause)) as ApiError
    const branch = (code: ApiError['code']) => {
      switch (code) {
        case 'record_done':
          return 'done'
        case 'conflict':
          return 'conflict'
        default:
          return 'failed'
      }
    }
    expect(branch(error.code)).toBe('done')
    expect(isKnownErrorCode(error.code)).toBe(true)
    expect(branch('record_locked')).toBe('failed')
    expect(isKnownErrorCode('record_locked')).toBe(false)
  })

  it('calls a body that is no envelope at all what it always did', async () => {
    const api = createApiClient({ baseUrl: BASE, fetch: failing(502, '<html>Bad gateway</html>') })
    await expect(api.listPets()).rejects.toMatchObject({ code: 'internal_error', status: 502 })
  })
})
