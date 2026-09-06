import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import {
  ApiErrorEnvelopeSchema,
  CheckHistoryPageSchema,
  HISTORY_PAGE_SIZE_MAX,
  PetSchema,
  SymptomCheckRecordSchema,
} from '@lapka/contracts'
import { GET as listPets, POST as createPet } from '@/app/(backend)/api/v1/pets/route'
import {
  DELETE as deletePet,
  GET as getPet,
  PATCH as patchPet,
} from '@/app/(backend)/api/v1/pets/[id]/route'
import { GET as listChecks } from '@/app/(backend)/api/v1/checks/route'
import { GET as getCheck } from '@/app/(backend)/api/v1/checks/[id]/route'
import { GET as meRoute } from '@/app/(backend)/api/v1/me/route'
import {
  CHECK_IDS,
  FIXTURE_PASSWORD,
  OWNER_A,
  OWNER_B,
  PET_IDS,
  connect,
  seedFixtures,
  type SeededFixtures,
} from './fixtures'

let db: Client
let seeded: SeededFixtures
let tokenA: string
let tokenB: string

async function signIn(email: string): Promise<string> {
  const client = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(token: string, url = 'http://test.local/api/v1/pets', init: { method?: string; body?: unknown } = {}) {
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function errorCode(response: Response): Promise<string> {
  return ApiErrorEnvelopeSchema.parse(await response.json()).error.code
}

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

afterAll(async () => {
  await db?.end()
})

describe('pets', () => {
  it('lists only the caller’s own, hiding soft-deleted ones', async () => {
    const response = await listPets(request(tokenA), undefined)
    expect(response.status).toBe(200)

    const pets = (await response.json()).map((pet: unknown) => PetSchema.parse(pet))
    expect(pets.map((pet: { id: string }) => pet.id).sort()).toEqual([PET_IDS.aCat, PET_IDS.aDog].sort())

    const forB = await (await listPets(request(tokenB), undefined)).json()
    // Owner B has one active pet and one soft-deleted.
    expect(forB.map((pet: { id: string }) => pet.id)).toEqual([PET_IDS.bCat])
  })

  it('runs the whole create, read, change, delete cycle', async () => {
    const created = await createPet(
      request(tokenA, 'http://test.local/api/v1/pets', {
        method: 'POST',
        body: { species: 'dog', name: 'Шарик', breed: 'husky', size_class: 'medium' },
      }),
      undefined,
    )
    expect(created.status).toBe(201)
    const pet = PetSchema.parse(await created.json())
    expect(pet.name).toBe('Шарик')
    expect(pet.size_class).toBe('medium')

    const read = await getPet(request(tokenA), params(pet.id))
    expect(read.status).toBe(200)
    expect(PetSchema.parse(await read.json()).id).toBe(pet.id)

    const patched = await patchPet(
      request(tokenA, 'http://test.local/api/v1/pets', { method: 'PATCH', body: { name: 'Бобик' } }),
      params(pet.id),
    )
    expect(patched.status).toBe(200)
    expect(PetSchema.parse(await patched.json()).name).toBe('Бобик')

    const removed = await deletePet(request(tokenA, 'http://test.local/api/v1/pets', { method: 'DELETE' }), params(pet.id))
    expect(removed.status).toBe(204)

    const afterDelete = await getPet(request(tokenA), params(pet.id))
    expect(afterDelete.status).toBe(404)

    const remaining = await (await listPets(request(tokenA), undefined)).json()
    expect(remaining.map((row: { id: string }) => row.id)).not.toContain(pet.id)
  })

  it('answers 404 for someone else’s pet, never 403', async () => {
    const response = await getPet(request(tokenB), params(PET_IDS.aCat))

    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe('not_found')
  })

  it('does not let one owner change or delete another’s pet', async () => {
    const patched = await patchPet(
      request(tokenB, 'http://test.local/api/v1/pets', { method: 'PATCH', body: { name: 'угнали' } }),
      params(PET_IDS.aCat),
    )
    expect(patched.status).toBe(404)

    const removed = await deletePet(request(tokenB, 'http://test.local/api/v1/pets', { method: 'DELETE' }), params(PET_IDS.aCat))
    expect(removed.status).toBe(404)

    const { rows } = await db.query<{ name: string; deleted_at: string | null }>(
      `select name, deleted_at from public.pets where id = $1`,
      [PET_IDS.aCat],
    )
    expect(rows[0]).toEqual({ name: 'Мурка', deleted_at: null })
  })

  it.each([
    ['an unknown id', '11111111-1111-4111-8111-999999999999'],
    ['a malformed id', 'not-a-uuid'],
  ])('answers %s with 404', async (_name, id) => {
    expect((await getPet(request(tokenA), params(id))).status).toBe(404)
  })

  it.each([
    ['the owner', { species: 'cat', name: 'Чужой', user_id: '00000000-0000-4000-8000-000000000000' }],
    ['the id', { species: 'cat', name: 'Чужой', id: '00000000-0000-4000-8000-000000000000' }],
    ['dog fields on a cat', { species: 'cat', name: 'Мурзик', size_class: 'large' }],
    ['an empty name', { species: 'cat', name: '' }],
    ['an unknown species', { species: 'ferret', name: 'Хорёк' }],
  ])('refuses a body that sets %s', async (_name, body) => {
    const response = await createPet(
      request(tokenA, 'http://test.local/api/v1/pets', { method: 'POST', body }),
      undefined,
    )

    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('bad_request')
  })

  it('refuses an update that changes nothing', async () => {
    const response = await patchPet(
      request(tokenA, 'http://test.local/api/v1/pets', { method: 'PATCH', body: {} }),
      params(PET_IDS.aCat),
    )

    expect(response.status).toBe(400)
  })

  it('hides the checks of a deleted pet, exactly as the site does', async () => {
    const before = await (await listChecks(request(tokenA, 'http://test.local/api/v1/checks'), undefined)).json()
    expect(before.items.some((row: { pet_id: string }) => row.pet_id === PET_IDS.aDog)).toBe(true)

    await deletePet(request(tokenA, 'http://test.local/api/v1/pets', { method: 'DELETE' }), params(PET_IDS.aDog))

    const after = await (await listChecks(request(tokenA, 'http://test.local/api/v1/checks'), undefined)).json()
    expect(after.items.some((row: { pet_id: string }) => row.pet_id === PET_IDS.aDog)).toBe(false)

    seeded = await seedFixtures(db)
    tokenA = await signIn(OWNER_A.email)
    tokenB = await signIn(OWNER_B.email)
  })
})

describe('history', () => {
  it('returns the caller’s active checks, newest first', async () => {
    const response = await listChecks(request(tokenA, 'http://test.local/api/v1/checks'), undefined)
    expect(response.status).toBe(200)

    const page = CheckHistoryPageSchema.parse(await response.json())
    expect(page.items.map((item) => item.id).sort()).toEqual([CHECK_IDS.aFirst, CHECK_IDS.aSecond].sort())
    expect(page.next_cursor).toBeNull()
  })

  it('never shows a soft-deleted check', async () => {
    const page = await (await listChecks(request(tokenB, 'http://test.local/api/v1/checks'), undefined)).json()

    expect(page.items.map((item: { id: string }) => item.id)).toEqual([CHECK_IDS.bOnly])
  })

  it('pages through checks that share a timestamp without losing or repeating one', async () => {
    // Owner A's two checks have exactly the same created_at, which is what
    // breaks pagination that orders by time alone.
    const { rows } = await db.query<{ count: string }>(
      `select count(distinct created_at) as count from public.symptom_checks
       where user_id = $1 and deleted_at is null`,
      [seeded.ownerAId],
    )
    expect(rows[0].count).toBe('1')

    const seen: string[] = []
    let cursor: string | null = null

    for (let page = 0; page < 5; page += 1) {
      const url = new URL('http://test.local/api/v1/checks')
      url.searchParams.set('limit', '1')
      if (cursor) url.searchParams.set('cursor', cursor)

      const body = CheckHistoryPageSchema.parse(
        await (await listChecks(request(tokenA, url.toString()), undefined)).json(),
      )
      seen.push(...body.items.map((item) => item.id))
      cursor = body.next_cursor
      if (!cursor) break
    }

    expect(seen.sort()).toEqual([CHECK_IDS.aFirst, CHECK_IDS.aSecond].sort())
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('filters by pet', async () => {
    const url = `http://test.local/api/v1/checks?pet_id=${PET_IDS.aDog}`
    const page = CheckHistoryPageSchema.parse(
      await (await listChecks(request(tokenA, url), undefined)).json(),
    )

    expect(page.items.map((item) => item.id)).toEqual([CHECK_IDS.aSecond])
  })

  it.each([
    ['a page size past the maximum', `limit=${HISTORY_PAGE_SIZE_MAX + 1}`],
    ['a page size of zero', 'limit=0'],
    ['a fractional page size', 'limit=1.5'],
    ['a cursor that is not a cursor', 'cursor=%%%'],
  ])('refuses %s', async (_name, query) => {
    const response = await listChecks(
      request(tokenA, `http://test.local/api/v1/checks?${query}`),
      undefined,
    )

    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('bad_request')
  })

  it('returns one stored result and hides other people’s', async () => {
    const mine = await getCheck(request(tokenA), params(CHECK_IDS.aFirst))
    expect(mine.status).toBe(200)
    expect(SymptomCheckRecordSchema.parse(await mine.json()).id).toBe(CHECK_IDS.aFirst)

    const theirs = await getCheck(request(tokenB), params(CHECK_IDS.aFirst))
    expect(theirs.status).toBe(404)

    const deleted = await getCheck(request(tokenB), params(CHECK_IDS.bDeleted))
    expect(deleted.status).toBe(404)
  })

  it('dates every record as UTC with an offset', async () => {
    const page = await (await listChecks(request(tokenA, 'http://test.local/api/v1/checks'), undefined)).json()

    for (const item of page.items) expect(item.created_at).toMatch(/Z$/)
  })
})

describe('balance', () => {
  it('is the same number the site shows', async () => {
    const fromApi = (await (await meRoute(request(tokenA, 'http://test.local/api/v1/me'), undefined)).json()).credits

    // The dashboard renders `profiles.credits` for the signed-in user; reading
    // the same column is what "the site and the API agree" means here.
    const { rows } = await db.query<{ credits: number }>(
      `select credits from public.profiles where id = $1`,
      [seeded.ownerAId],
    )

    expect(fromApi).toBe(rows[0].credits)
    expect(fromApi).toBe(OWNER_A.expectedCredits)
  })

  it('moves together with the ledger when a credit is spent', async () => {
    const service = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    await service.rpc('apply_symptom_check_usage', {
      p_user_id: seeded.ownerAId,
      p_symptom_check_id: null,
    })

    const fromApi = (await (await meRoute(request(tokenA, 'http://test.local/api/v1/me'), undefined)).json()).credits
    const { rows } = await db.query<{ ledger_sum: string }>(
      `select coalesce(sum(delta), 0) as ledger_sum from public.credit_ledger where user_id = $1`,
      [seeded.ownerAId],
    )

    expect(fromApi).toBe(OWNER_A.expectedCredits - 1)
    expect(Number(rows[0].ledger_sum)).toBe(fromApi)

    seeded = await seedFixtures(db)
    tokenA = await signIn(OWNER_A.email)
    tokenB = await signIn(OWNER_B.email)
  })

  it('cannot be written through any product route', async () => {
    const created = await createPet(
      request(tokenA, 'http://test.local/api/v1/pets', {
        method: 'POST',
        body: { species: 'cat', name: 'Богач', credits: 9999 },
      }),
      undefined,
    )
    expect(created.status).toBe(400)

    const { rows } = await db.query<{ credits: number }>(
      `select credits from public.profiles where id = $1`,
      [seeded.ownerAId],
    )
    expect(rows[0].credits).toBe(OWNER_A.expectedCredits)
  })
})
