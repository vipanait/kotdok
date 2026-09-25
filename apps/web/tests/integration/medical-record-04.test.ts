import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { HealthEventSchema, HealthOverviewSchema, HealthProductSchema } from '@lapka/contracts'
import { GET as getCatalog } from '@/app/(backend)/api/v1/health/catalog/route'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { PATCH as patchEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures } from './fixtures'

// MR-04: the catalogue against the real database. The products are this
// test's own, marked verified; the draft list stays out of it.

let db: Client
let token: string
const cat: string = PET_IDS.aCat
const dog: string = PET_IDS.aDog
const ids: Record<string, string> = {}

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function catalog(query: string) {
  const response = await getCatalog(request(`http://test.local/api/v1/health/catalog?${query}`), undefined)
  expect(response.status).toBe(200)
  return (await response.json()).map((row: unknown) => HealthProductSchema.parse(row))
}

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  token = await signIn(OWNER_A.email)
  await db.query(`delete from public.health_products where name like 'Тест %'`)
  const { rows } = await db.query(
    `insert into public.health_products (kind, name, manufacturer, aliases, species, form, targets, interval_value, interval_unit, popularity, verified) values
      ('vaccine', 'Тест Нобивак Tricat', 'MSD', array['Test Nobivac Tricat'], array['cat'], 'injection', array['panleukopenia','calicivirus','rhinotracheitis'], 1, 'year', 1, true),
      ('vaccine', 'Тест Нобивак DHPPi', 'MSD', array['Test Nobivac DHPPi'], array['dog'], 'injection', array['distemper','adenovirus','parvovirus','parainfluenza'], 1, 'year', 1, true),
      ('vaccine', 'Тест Рабикан', 'Биокомбинат', '{}', array['cat','dog'], 'injection', array['rabies'], 1, 'year', null, true),
      ('vaccine', 'Тест Черновик', 'Нет', '{}', array['cat'], 'injection', array['rabies'], 1, 'year', 2, false)
     returning id, name`,
  )
  for (const row of rows) ids[row.name] = row.id
})

beforeEach(async () => {
  await db.query(`delete from public.pet_health_events where pet_id in ($1, $2)`, [cat, dog])
})

afterAll(async () => {
  await db.query(`delete from public.health_products where name like 'Тест %'`)
  await db?.end()
})

describe('GET /api/v1/health/catalog', () => {
  it('gives a cat no dog products (MR-04.1)', async () => {
    const names = (await catalog('species=cat&kind=vaccine')).map((p: { name: string }) => p.name)
    expect(names).toContain('Тест Нобивак Tricat')
    expect(names).toContain('Тест Рабикан')
    expect(names).not.toContain('Тест Нобивак DHPPi')
  })

  it('finds «нобив», any case, by maker and on the wrong layout (MR-04.2)', async () => {
    for (const q of ['нобив', 'НОБИВ', 'msd', 'yj,bd']) {
      const names = (await catalog(`species=cat&kind=vaccine&q=${encodeURIComponent(q)}`)).map((p: { name: string }) => p.name)
      expect(names, q).toContain('Тест Нобивак Tricat')
      expect(names, q).not.toContain('Тест Рабикан')
    }
  })

  it('hides unverified products unless the stack is set up to show them', async () => {
    const names = (await catalog('species=cat&kind=vaccine')).map((p: { name: string }) => p.name)
    expect(names.includes('Тест Черновик')).toBe(process.env.HEALTH_CATALOG_INCLUDE_UNVERIFIED === '1')
  })

  it('refuses a species or kind it does not know', async () => {
    const response = await getCatalog(request('http://test.local/api/v1/health/catalog?species=fish&kind=vaccine'), undefined)
    expect(response.status).toBe(400)
  })
})

describe('saving a product with a record', () => {
  it('refuses a dog product on a cat even with a forged product_id (MR-04.1)', async () => {
    const response = await createEvent(
      request('http://test.local/x', 'POST', {
        kind: 'vaccination',
        status: 'done',
        date: day(-1),
        items: [{ name: 'Тест Нобивак DHPPi', targets: ['rabies'], product_id: ids['Тест Нобивак DHPPi'] }],
      }),
      params(cat),
    )
    expect(response.status).toBe(400)
  })

  it('keeps the saved name and diseases when the catalogue changes (MR-04.3)', async () => {
    const created = await createEvent(
      request('http://test.local/x', 'POST', {
        kind: 'vaccination',
        status: 'done',
        date: day(-1),
        items: [{ name: 'Тест Рабикан', targets: ['rabies'], product_id: ids['Тест Рабикан'], next_on: day(364) }],
      }),
      params(cat),
    )
    expect(created.status).toBe(201)
    const done = HealthEventSchema.parse(await created.json())
    expect(done.items[0].product_id).toBe(ids['Тест Рабикан'])

    await db.query(`update public.health_products set name = 'Тест Рабикан Новый', targets = array['felv'] where id = $1`, [ids['Тест Рабикан']])
    try {
      const { events } = HealthOverviewSchema.parse(await (await getHealth(request('http://test.local/x'), params(cat))).json())
      for (const event of events) {
        expect(event.items[0].name).toBe('Тест Рабикан')
        expect(event.items[0].targets).toEqual(['rabies'])
      }
      // The next plan came from the same product.
      expect(events.find((e) => e.status === 'planned')?.items[0].product_id).toBe(ids['Тест Рабикан'])
    } finally {
      await db.query(`update public.health_products set name = 'Тест Рабикан', targets = array['rabies'] where id = $1`, [ids['Тест Рабикан']])
    }
  })

  it('saves a vaccine with its own name and no product (MR-04.4)', async () => {
    const response = await createEvent(
      request('http://test.local/x', 'POST', {
        kind: 'vaccination',
        status: 'done',
        date: day(-1),
        items: [{ name: 'Своя вакцина', targets: ['rabies'] }],
      }),
      params(cat),
    )
    expect(response.status).toBe(201)
    expect(HealthEventSchema.parse(await response.json()).items[0].product_id).toBeNull()
  })

  it('refuses a product of another species when a record is corrected', async () => {
    const done = HealthEventSchema.parse(
      await (
        await createEvent(
          request('http://test.local/x', 'POST', { kind: 'vaccination', status: 'done', date: day(-1), items: [{ targets: ['rabies'] }] }),
          params(cat),
        )
      ).json(),
    )
    const response = await patchEvent(
      request('http://test.local/x', 'PATCH', { items: [{ id: done.items[0].id, name: 'x', targets: ['rabies'], product_id: ids['Тест Нобивак DHPPi'] }] }),
      { params: Promise.resolve({ id: cat, eventId: done.id }) },
    )
    expect(response.status).toBe(400)
  })
})
