import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCatalog, listCatalog } from '@/server/medical-record/catalog-service'

type Row = Record<string, unknown>

function product(id: string, name: string, species: string[], manufacturer = 'MSD'): Row {
  return {
    id, kind: 'vaccine', name, name_en: null, manufacturer, aliases: [], species, form: 'injection',
    targets: ['rabies'], interval_value: 1, interval_unit: 'year', popularity: 1,
  }
}

const TRICAT = product('11111111-1111-4111-8111-000000000a01', 'Нобивак Tricat', ['cat'])
const RABIKAN = product('11111111-1111-4111-8111-000000000a02', 'Рабикан', ['cat', 'dog'], 'Биокомбинат')

/** A client whose every read answers with `answers.shift()`; the builder is thenable like PostgREST's. */
function supabaseAnswering(answers: { data: Row[] | null; error: { message: string } | null }[]) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then(resolve: (value: unknown) => void) {
      resolve(answers.shift())
    },
  }
  const from = vi.fn(() => builder)
  return { client: { from } as never, from }
}

const names = (result: Awaited<ReturnType<typeof listCatalog>>) => (result.ok ? result.data.map((p) => p.name) : result)

describe('the catalogue', () => {
  beforeEach(() => {
    forgetCatalog()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T12:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('reads the rows of a species and kind once and filters each query in memory', async () => {
    const { client, from } = supabaseAnswering([{ data: [TRICAT, RABIKAN], error: null }])

    expect(names(await listCatalog(client, 'cat', 'vaccine', 'нобив'))).toEqual(['Нобивак Tricat'])
    expect(names(await listCatalog(client, 'cat', 'vaccine', 'раб'))).toEqual(['Рабикан'])
    expect(names(await listCatalog(client, 'cat', 'vaccine', ''))).toEqual(['Нобивак Tricat', 'Рабикан'])
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('keeps each species and kind apart', async () => {
    const { client, from } = supabaseAnswering([
      { data: [TRICAT, RABIKAN], error: null },
      { data: [RABIKAN], error: null },
    ])

    expect(names(await listCatalog(client, 'cat', 'vaccine', ''))).toEqual(['Нобивак Tricat', 'Рабикан'])
    expect(names(await listCatalog(client, 'dog', 'vaccine', ''))).toEqual(['Рабикан'])
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('reads again once the rows are an hour old', async () => {
    const { client, from } = supabaseAnswering([
      { data: [TRICAT], error: null },
      { data: [TRICAT, RABIKAN], error: null },
    ])

    await listCatalog(client, 'cat', 'vaccine', '')
    vi.setSystemTime(new Date('2026-10-25T13:00:01.000Z'))
    expect(names(await listCatalog(client, 'cat', 'vaccine', ''))).toEqual(['Нобивак Tricat', 'Рабикан'])
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed read', async () => {
    const { client, from } = supabaseAnswering([
      { data: null, error: { message: 'down' } },
      { data: [TRICAT], error: null },
    ])

    expect(await listCatalog(client, 'cat', 'vaccine', '')).toEqual({ ok: false, reason: 'storage_error', message: 'down' })
    expect(names(await listCatalog(client, 'cat', 'vaccine', ''))).toEqual(['Нобивак Tricat'])
    expect(from).toHaveBeenCalledTimes(2)
  })
})
