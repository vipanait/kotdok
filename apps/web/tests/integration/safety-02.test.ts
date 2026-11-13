import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Client } from 'pg'
import { ApiErrorEnvelopeSchema, SafetyIndexSchema, SafetyItemSchema } from '@lapka/contracts'
import { GET as indexRoute } from '@/app/(backend)/api/v1/safety/index/route'
import { GET as itemRoute } from '@/app/(backend)/api/v1/safety/items/[slug]/route'
import { OWNER_A, OWNER_B, PET_IDS, bearerRequest, connect, seedFixtures, signIn } from './fixtures'

/**
 * SAFE-02: the «Можно ли» reference through the v1 API — the light index, an
 * entry with the notes for one of the caller's pets, and the production rule
 * that a draft is not served.
 */

let db: Client
let tokenA: string
let tokenB: string

const INDEX_URL = 'http://test.local/api/v1/safety/index'
const itemUrl = (slug: string, petId?: string) =>
  `http://test.local/api/v1/safety/items/${slug}${petId ? `?pet_id=${encodeURIComponent(petId)}` : ''}`
const slugParams = (slug: string) => ({ params: Promise.resolve({ slug }) })

async function errorCode(response: Response): Promise<string> {
  return ApiErrorEnvelopeSchema.parse(await response.json()).error.code
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
  // The profile the notes are read from: an allergy no pilot entry names, and a chronic condition.
  await db.query(`update public.pets set allergies = $2, chronic_conditions = $3 where id = $1`, [
    PET_IDS.aDog,
    ['курица'],
    ['ХБП'],
  ])
})

afterAll(async () => {
  // As the fixtures seed the dog.
  await db?.query(`update public.pets set allergies = '{}', chronic_conditions = null where id = $1`, [PET_IDS.aDog])
  await db?.end()
})

describe('the reference while every pilot entry is a draft (a preview shows drafts)', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'preview')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('serves the index in the account’s language, matching the contract', async () => {
    const response = await indexRoute(bearerRequest(INDEX_URL, {}, tokenA), undefined)
    expect(response.status).toBe(200)
    const index = SafetyIndexSchema.parse(await response.json())
    const chocolate = index.items.find(item => item.slug === 'shokolad')
    expect(chocolate?.verdict.dog).toBe('danger')
    expect(chocolate?.name).toBe('Шоколад')

    // Owner B's account is in English.
    const english = SafetyIndexSchema.parse(await (await indexRoute(bearerRequest(INDEX_URL, {}, tokenB), undefined)).json())
    expect(english.items.find(item => item.slug === 'shokolad')?.name).toBe('Chocolate')
  })

  it('refuses both routes without a token', async () => {
    expect((await indexRoute(new NextRequest(INDEX_URL), undefined)).status).toBe(401)
    expect((await itemRoute(new NextRequest(itemUrl('shokolad')), slugParams('shokolad'))).status).toBe(401)
  })

  it('serves an entry without a pet: no pet, no notes', async () => {
    const response = await itemRoute(bearerRequest(itemUrl('shokolad'), {}, tokenB), slugParams('shokolad'))
    expect(response.status).toBe(200)
    const item = SafetyItemSchema.parse(await response.json())
    expect(item.name).toBe('Chocolate')
    expect(item.by_species.dog.verdict).toBe('danger')
    expect(item.by_species.dog.if_eaten).toBe('call_now')
    expect(item.toxin_slug).toBe('shokolad')
    expect(item.pet).toBeNull()
    expect(item.pet_notes).toEqual([])
  })

  it('puts the pet’s species first and leaves the chronic line off a danger verdict', async () => {
    const response = await itemRoute(bearerRequest(itemUrl('shokolad', PET_IDS.aDog), {}, tokenA), slugParams('shokolad'))
    expect(response.status).toBe(200)
    const body = await response.json()
    // As sent; parsing rebuilds the object in the schema's order, and a client orders by `pet.species`.
    expect(Object.keys(body.by_species)).toEqual(['dog', 'cat'])
    const item = SafetyItemSchema.parse(body)
    expect(item.pet).toEqual({ id: PET_IDS.aDog, species: 'dog' })
    expect(item.name).toBe('Шоколад')
    expect(item.pet_notes).not.toContainEqual({ kind: 'chronic' })
  })

  it('adds the chronic line under a verdict that is not danger', async () => {
    const response = await itemRoute(bearerRequest(itemUrl('morkov', PET_IDS.aDog), {}, tokenA), slugParams('morkov'))
    expect(response.status).toBe(200)
    const item = SafetyItemSchema.parse(await response.json())
    expect(item.by_species.dog.verdict).not.toBe('danger')
    // «курица» is not a carrot: the allergy is not noted, only the chronic line.
    expect(item.pet_notes).toEqual([{ kind: 'chronic' }])
  })

  it('notes an allergy that names the entry, in either language', async () => {
    // Owner A's account is in Russian, the allergy written in English; owner B the other way round.
    await db.query(`update public.pets set allergies = $2 where id = $1`, [PET_IDS.aDog, ['Chocolate']])
    await db.query(`update public.pets set allergies = $2 where id = $1`, [PET_IDS.bCat, ['молочный шоколад']])
    try {
      const ru = SafetyItemSchema.parse(
        await (await itemRoute(bearerRequest(itemUrl('shokolad', PET_IDS.aDog), {}, tokenA), slugParams('shokolad'))).json(),
      )
      expect(ru.name).toBe('Шоколад')
      expect(ru.pet_notes).toContainEqual({ kind: 'allergy', allergy: 'Chocolate' })

      const en = SafetyItemSchema.parse(
        await (await itemRoute(bearerRequest(itemUrl('shokolad', PET_IDS.bCat), {}, tokenB), slugParams('shokolad'))).json(),
      )
      expect(en.name).toBe('Chocolate')
      expect(en.pet_notes).toEqual([{ kind: 'allergy', allergy: 'молочный шоколад' }])
    } finally {
      await db.query(`update public.pets set allergies = $2 where id = $1`, [PET_IDS.aDog, ['курица']])
      await db.query(`update public.pets set allergies = '{}' where id = $1`, [PET_IDS.bCat])
    }
  })

  it('answers someone else’s pet and a deleted one as missing', async () => {
    const foreign = await itemRoute(bearerRequest(itemUrl('shokolad', PET_IDS.bCat), {}, tokenA), slugParams('shokolad'))
    expect(foreign.status).toBe(404)
    expect(await errorCode(foreign)).toBe('not_found')

    // Owner B's own pet, soft-deleted.
    const deleted = await itemRoute(bearerRequest(itemUrl('shokolad', PET_IDS.bDeleted), {}, tokenB), slugParams('shokolad'))
    expect(deleted.status).toBe(404)
    expect(await errorCode(deleted)).toBe('not_found')
  })

  it('answers an unknown slug with 404 and a malformed pet id with 400', async () => {
    const unknown = await itemRoute(bearerRequest(itemUrl('net-takogo'), {}, tokenA), slugParams('net-takogo'))
    expect(unknown.status).toBe(404)
    expect(await errorCode(unknown)).toBe('not_found')

    const malformed = await itemRoute(bearerRequest(itemUrl('shokolad', 'не-uuid'), {}, tokenA), slugParams('shokolad'))
    expect(malformed.status).toBe(400)
    expect(await errorCode(malformed)).toBe('bad_request')
  })
})

describe('production', () => {
  // A published copy of the carrot and a draft chocolate, read through the
  // real loader: the files on disk are swapped, not the functions that filter them.
  const CONTENT_DIR = /content[\\/]safety$/
  const FILES: Record<string, (entry: Record<string, unknown>) => Record<string, unknown>> = {
    'morkov.json': entry => ({ ...entry, review: { status: 'published', draftedBy: 'model' } }),
    'shokolad.json': entry => ({ ...entry, review: { status: 'draft', draftedBy: 'model' } }),
  }

  let routes: {
    index: typeof indexRoute
    item: typeof itemRoute
  }

  beforeAll(async () => {
    vi.resetModules()
    vi.doMock('node:fs', async importOriginal => {
      const fs = await importOriginal<typeof import('node:fs')>()
      const readdirSync = ((path: string, ...rest: unknown[]) =>
        CONTENT_DIR.test(String(path))
          ? Object.keys(FILES)
          : (fs.readdirSync as (...args: unknown[]) => unknown)(path, ...rest)) as typeof fs.readdirSync
      const readFileSync = ((path: string, ...rest: unknown[]) => {
        const name = String(path).split(/[\\/]/).pop() ?? ''
        const raw = (fs.readFileSync as (...args: unknown[]) => unknown)(path, ...rest)
        if (!/content[\\/]safety[\\/]/.test(String(path)) || !FILES[name]) return raw
        return JSON.stringify(FILES[name](JSON.parse(String(raw))))
      }) as typeof fs.readFileSync
      return { ...fs, default: { ...fs, readdirSync, readFileSync }, readdirSync, readFileSync }
    })
    routes = {
      index: (await import('@/app/(backend)/api/v1/safety/index/route')).GET,
      item: (await import('@/app/(backend)/api/v1/safety/items/[slug]/route')).GET,
    }
  })

  afterAll(() => {
    vi.doUnmock('node:fs')
    vi.resetModules()
  })

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', undefined)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('serves published entries only, in the index and by slug', async () => {
    const index = SafetyIndexSchema.parse(await (await routes.index(bearerRequest(INDEX_URL, {}, tokenA), undefined)).json())
    expect(index.items.map(item => item.slug)).toEqual(['morkov'])

    const draft = await routes.item(bearerRequest(itemUrl('shokolad'), {}, tokenA), slugParams('shokolad'))
    expect(draft.status).toBe(404)
    expect(await errorCode(draft)).toBe('not_found')

    const published = await routes.item(bearerRequest(itemUrl('morkov'), {}, tokenA), slugParams('morkov'))
    expect(published.status).toBe(200)
  })
})
