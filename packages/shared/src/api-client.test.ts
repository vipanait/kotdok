import { describe, expect, it } from 'vitest'
import { FEATURES_HEADER, isKnownErrorCode } from '@lapka/contracts'
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

describe('what the client says it can read (FB-2 release)', () => {
  it('names pet-dates on every request, so the server sends the dates to it and not to older builds', async () => {
    const seen: Array<Record<string, string>> = []
    const fetch: FetchLike = async (_url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) })
      return ok([]) as never
    }
    await createApiClient({ baseUrl: BASE, fetch }).listPets()
    expect(seen[0]['X-Lapka-Features']).toBe('pet-dates,pet-avatar,followup')
  })
})

describe('questions about a check', () => {
  const check = '11111111-1111-4111-8111-000000000009'
  const item = {
    id: '11111111-1111-4111-8111-000000000010',
    question: 'Можно ли кормить?',
    answer: 'Понемногу.',
    alert: 'none',
    off_topic: false,
    created_at: '2026-11-13T10:00:00.000Z',
  }
  const thread = { items: [item], limit: 3, remaining: 2, open_until: '2026-11-15T09:00:00.000Z', closed: null }

  it('reads the thread of a check', async () => {
    const seen: string[] = []
    const fetch: FetchLike = async (url) => {
      seen.push(String(url))
      return ok(thread)
    }
    const api = createApiClient({ baseUrl: BASE, fetch })
    await expect(api.getCheckQuestions(check)).resolves.toEqual(thread)
    expect(seen).toEqual([`${BASE}/api/v1/checks/${check}/questions`])
  })

  it('asks with the key, the question and the owner’s day', async () => {
    const seen: { url: string; method?: string; key?: string; body?: unknown }[] = []
    const fetch: FetchLike = async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      seen.push({ url: String(url), method: init?.method, key: headers['Idempotency-Key'], body: JSON.parse(String(init?.body)) })
      return ok({ item, thread })
    }
    const api = createApiClient({ baseUrl: BASE, fetch })
    await expect(api.askCheckQuestion(check, 'key-12345678', { question: 'Можно ли кормить?' }, '2026-11-13')).resolves.toEqual({ item, thread })
    expect(seen).toEqual([
      {
        url: `${BASE}/api/v1/checks/${check}/questions?today=2026-11-13`,
        method: 'POST',
        key: 'key-12345678',
        body: { question: 'Можно ли кормить?' },
      },
    ])
  })

  it('waits for an answer longer than the client waits for anything else', async () => {
    // The model may take a minute; the client's own deadline here is far shorter.
    const armed: number[] = []
    // No Node or DOM types in this package: the timer is reached the way the client reaches it.
    const timers = globalThis as unknown as { setTimeout: (handler: () => void, ms?: number) => unknown }
    const real = timers.setTimeout
    timers.setTimeout = (handler, ms) => {
      armed.push(ms ?? 0)
      // Armed far off, so neither deadline fires while the answer is read.
      return real(handler, 60_000)
    }
    try {
      const api = createApiClient({ baseUrl: BASE, fetch: async () => ok({ item, thread }), timeoutMs: 20 })
      await api.askCheckQuestion(check, 'key-12345678', { question: 'Можно ли кормить?' })
      await api.getCheckQuestions(check).catch(() => null)
    } finally {
      timers.setTimeout = real
    }
    expect(armed).toEqual([75_000, 20])
  })
})

describe('pet safety reference', () => {
  const entry = {
    slug: 'morkov',
    category: 'food',
    name: 'Морковь',
    by_species: {
      dog: { verdict: 'safe', summary: 'Можно.', why: 'Не ядовита.', signs: [], if_eaten: 'none' },
      cat: { verdict: 'safe', summary: 'Можно.', why: 'Не ядовита.', signs: [], if_eaten: 'none' },
    },
    first_steps: [],
    avoid: [],
    toxin_slug: null,
    sources: [{ title: 'ASPCA', url: 'https://www.aspca.org/' }],
    pet: { id: '11111111-1111-4111-8111-000000000002', species: 'dog' },
    pet_notes: [{ kind: 'chronic' }],
  }

  function recording(body: unknown) {
    const urls: string[] = []
    const fetch: FetchLike = async (url) => {
      urls.push(url)
      return ok(body)
    }
    return { urls, api: createApiClient({ baseUrl: BASE, fetch }) }
  }

  it('reads the index', async () => {
    const item = { slug: 'morkov', category: 'food', name: 'Морковь', aliases: ['морковка'], verdict: { cat: 'safe', dog: 'safe' } }
    const { urls, api } = recording({ items: [item] })

    await expect(api.getSafetyIndex()).resolves.toEqual({ items: [item] })
    expect(urls).toEqual([`${BASE}/api/v1/safety/index`])
  })

  it('reads an entry for a pet, and without one', async () => {
    const { urls, api } = recording(entry)

    await expect(api.getSafetyItem('morkov', entry.pet.id)).resolves.toEqual(entry)
    await api.getSafetyItem('morkov')
    expect(urls).toEqual([`${BASE}/api/v1/safety/items/morkov?pet_id=${entry.pet.id}`, `${BASE}/api/v1/safety/items/morkov`])
  })

  it('reads an entry a later server added a field to', async () => {
    const { api } = recording({ ...entry, added_later: true })

    await expect(api.getSafetyItem('morkov')).resolves.toEqual(entry)
  })
})

describe('api client features header', () => {
  const headerOf = async (features?: readonly string[]) => {
    let seen: Record<string, string> = {}
    const fetch: FetchLike = async (_url, init) => {
      seen = (init?.headers ?? {}) as Record<string, string>
      return ok([])
    }
    await createApiClient({ baseUrl: BASE, fetch, features }).listPets().catch(() => undefined)
    return seen[FEATURES_HEADER]
  }

  it('sends the fixed list alone, and the extra features only when given', async () => {
    const fixed = await headerOf()
    expect(fixed).toBe('pet-dates,pet-avatar,followup')
    expect(await headerOf(['pet-documents'])).toBe(`${fixed},pet-documents`)
  })
})

describe('pet documents (DOC-1)', () => {
  const pet = '11111111-1111-4111-8111-000000000001'
  const doc = '22222222-2222-4222-8222-000000000002'
  const file = '33333333-3333-4333-8333-000000000003'
  const stored = {
    id: doc,
    kind: 'vet_passport',
    title: '',
    document_date: null,
    status: 'stored',
    failure_code: null,
    page_count: 2,
    created_at: '2026-11-16T10:00:00.000Z',
    files: [{ id: file, content_type: 'image/jpeg', url: 'https://storage.example/read', page_count: null }],
    draft: null,
    // A field a later server adds is dropped, not refused.
    later_field: true,
  }
  const grant = {
    document_id: doc,
    uploads: [{ file_id: file, url: 'https://storage.example/put', method: 'PUT', headers: { 'content-type': 'image/jpeg' }, expires_at: '2026-11-16T10:15:00.000Z' }],
  }

  function recording(answers: Array<{ ok: boolean; status: number; json: () => Promise<unknown> }>) {
    const seen: Array<{ method: string; url: string; body?: string }> = []
    const fetch: FetchLike = async (url, init) => {
      seen.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body })
      return answers.shift()!
    }
    return { api: createApiClient({ baseUrl: BASE, fetch }), seen }
  }

  it('lists, reads, creates, completes, changes and deletes on the documents paths', async () => {
    const { api, seen } = recording([
      ok({ documents: [stored], free_recognitions_left: 3, recognition_price: 0 }),
      ok(stored),
      { ok: true, status: 201, json: async () => grant },
      ok(stored),
      ok({ ...stored, title: 'Паспорт' }),
      { ok: true, status: 204, json: async () => null },
    ])

    const list = await api.listDocuments(pet)
    expect(list.documents[0]).not.toHaveProperty('later_field')
    expect((await api.getDocument(pet, doc)).status).toBe('stored')
    const body = { kind: 'vet_passport' as const, files: [{ content_type: 'image/jpeg' as const, size_bytes: 1000 }] }
    expect((await api.createDocument(pet, body)).uploads[0].method).toBe('PUT')
    expect((await api.completeDocument(pet, doc)).id).toBe(doc)
    expect((await api.changeDocument(pet, doc, { title: 'Паспорт' })).title).toBe('Паспорт')
    await expect(api.deleteDocument(pet, doc)).resolves.toBeUndefined()

    const path = `${BASE}/api/v1/pets/${pet}/documents`
    expect(seen.map(({ method, url }) => [method, url])).toEqual([
      ['GET', path],
      ['GET', `${path}/${doc}`],
      ['POST', path],
      ['POST', `${path}/${doc}/complete`],
      ['PATCH', `${path}/${doc}`],
      ['DELETE', `${path}/${doc}`],
    ])
    expect(JSON.parse(seen[2].body!)).toEqual(body)
    expect(JSON.parse(seen[4].body!)).toEqual({ title: 'Паспорт' })
  })

  it('keeps a refused file’s reason in the error details', async () => {
    const { api } = recording([
      { ok: false, status: 400, json: async () => ({ error: { code: 'bad_request', message: 'The file was refused', request_id: 'r1', details: { reason: 'encrypted' } } }) },
    ])
    await expect(api.completeDocument(pet, doc)).rejects.toMatchObject({ code: 'bad_request', status: 400, details: { reason: 'encrypted' } })
  })

  it('reads a kind, a status and a file type of a later server without breaking', async () => {
    const later = {
      ...stored,
      kind: 'tattoo',
      status: 'archived',
      files: [...stored.files, { id: file, content_type: 'image/heic', url: 'https://storage.example/heic', page_count: null }],
    }
    const { api } = recording([ok(later)])
    const read = await api.getDocument(pet, doc)
    expect(read.kind).toBe('other')
    expect(read.status).toBe('stored')
    expect(read.files.map((f) => f.content_type)).toEqual(['image/jpeg'])
  })

  it('leaves out of the list a document that does not read, and keeps the others', async () => {
    const { api } = recording([ok({ documents: [{ ...stored, id: 'not-a-uuid' }, { ...stored, kind: 'tattoo' }], free_recognitions_left: 3, recognition_price: 0 })])
    const list = await api.listDocuments(pet)
    expect(list.documents.map((d) => d.kind)).toEqual(['other'])
  })

  it('reads a later price of a recognition without breaking the list', async () => {
    const { api } = recording([ok({ documents: [stored], free_recognitions_left: 0, recognition_price: 2 })])
    const list = await api.listDocuments(pet)
    expect(list.recognition_price).toBe(2)
    expect(list.documents).toHaveLength(1)
  })

  it('still refuses a price that is not a count of credits', async () => {
    const { api } = recording([ok({ documents: [stored], free_recognitions_left: 0, recognition_price: -1 })])
    await expect(api.listDocuments(pet)).rejects.toMatchObject({ name: 'ApiContractError' })
  })

  it('refuses a document that does not match the contract', async () => {
    const { api } = recording([ok({ ...stored, id: 'not-a-uuid' })])
    await expect(api.getDocument(pet, doc)).rejects.toMatchObject({ name: 'ApiContractError' })
  })
})
