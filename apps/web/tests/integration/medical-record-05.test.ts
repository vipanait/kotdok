import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { DueItemSchema, HealthEventSchema, HealthOverviewSchema } from '@lapka/contracts'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { PATCH as patchEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { GET as listDue } from '@/app/(backend)/api/v1/pets/due/route'
import { FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures } from './fixtures'

// MR-05: parasite treatments on the same records, plans and catalogue.

let db: Client
let token: string
const cat: string = PET_IDS.aCat
const ids: Record<string, string> = {}

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(method = 'GET', body?: unknown) {
  return new NextRequest('http://test.local/x', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

async function overview() {
  return HealthOverviewSchema.parse(await (await getHealth(request(), params(cat))).json())
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  token = await signIn(OWNER_A.email)
  await db.query(`delete from public.health_products where name like 'Тест %'`)
  const { rows } = await db.query(
    `insert into public.health_products (kind, name, manufacturer, species, form, targets, interval_value, interval_unit, popularity, verified) values
      ('antiparasitic', 'Тест Бравекто Спот-он', 'MSD', array['cat','dog'], 'drops', array['fleas','ticks'], 12, 'week', 1, true),
      ('antiparasitic', 'Тест Мильбемакс', 'Elanco', array['cat','dog'], 'tablet', array['worms'], 3, 'month', 2, true),
      ('antiparasitic', 'Тест Инспектор', 'Экопром', array['cat','dog'], 'drops', array['fleas','ticks','worms'], 1, 'month', 3, true),
      ('antiparasitic', 'Тест Нексгард', 'BI', array['dog'], 'tablet', array['fleas','ticks'], 1, 'month', 4, true),
      ('vaccine', 'Тест Рабикан П', 'Биокомбинат', array['cat','dog'], 'injection', array['rabies'], 1, 'year', null, true)
     returning id, name`,
  )
  for (const row of rows) ids[row.name] = row.id
})

beforeEach(async () => {
  await db.query(`delete from public.pet_health_events where pet_id = $1`, [cat])
})

afterAll(async () => {
  await db.query(`delete from public.health_products where name like 'Тест %'`)
  await db?.end()
})

describe('parasite treatments', () => {
  it('two products with different intervals keep two different plans (MR-05.2)', async () => {
    const response = await createEvent(
      request('POST', {
        kind: 'parasite',
        status: 'done',
        date: day(-1),
        items: [
          { name: 'Тест Бравекто Спот-он', targets: ['fleas', 'ticks'], product_id: ids['Тест Бравекто Спот-он'], next_on: day(83) },
          { name: 'Тест Мильбемакс', targets: ['worms'], product_id: ids['Тест Мильбемакс'], next_on: day(90) },
        ],
      }),
      params(cat),
    )
    expect(response.status).toBe(201)
    const planned = (await overview()).events.filter((e) => e.status === 'planned')
    expect(planned.map((e) => e.date).sort()).toEqual([day(83), day(90)])
    expect(planned.every((e) => e.kind === 'parasite')).toBe(true)
  })

  it('keeps a combined product one item and one due date (MR-05.3)', async () => {
    await createEvent(
      request('POST', {
        kind: 'parasite',
        status: 'done',
        date: day(-1),
        items: [{ name: 'Тест Инспектор', targets: ['fleas', 'ticks', 'worms'], product_id: ids['Тест Инспектор'], next_on: day(29) }],
      }),
      params(cat),
    )
    const { rows } = await db.query(
      `select count(*)::int as n from public.pet_health_items where pet_id = $1 and deleted_at is null`,
      [cat],
    )
    expect(rows[0].n).toBe(2)
    const due = (await (await listDue(request(), undefined)).json())
      .map((row: unknown) => DueItemSchema.parse(row))
      .filter((row: { pet_id: string }) => row.pet_id === cat)
    expect(due).toHaveLength(1)
    expect(due[0].targets).toEqual(['fleas', 'ticks', 'worms'])
  })

  it('refuses a dog-only product on a cat, and a vaccine as a treatment (MR-05.4)', async () => {
    const dogOnly = await createEvent(
      request('POST', { kind: 'parasite', status: 'done', date: day(-1), items: [{ name: 'x', targets: ['fleas'], product_id: ids['Тест Нексгард'] }] }),
      params(cat),
    )
    expect(dogOnly.status).toBe(400)
    const vaccine = await createEvent(
      request('POST', { kind: 'parasite', status: 'done', date: day(-1), items: [{ name: 'x', targets: ['fleas'], product_id: ids['Тест Рабикан П'] }] }),
      params(cat),
    )
    expect(vaccine.status).toBe(400)
  })

  it('refuses parasites on a vaccination when a record is corrected', async () => {
    const done = HealthEventSchema.parse(
      await (await createEvent(request('POST', { kind: 'vaccination', status: 'done', date: day(-1), items: [{ targets: ['rabies'] }] }), params(cat))).json(),
    )
    const response = await patchEvent(
      request('PATCH', { items: [{ id: done.items[0].id, targets: ['fleas'] }] }),
      { params: Promise.resolve({ id: cat, eventId: done.id }) },
    )
    expect(response.status).toBe(400)
  })

  it('does not make the pet vaccinated', async () => {
    await db.query(`update public.pets set vaccinated = false, vaccinated_form = false where id = $1`, [cat])
    await createEvent(request('POST', { kind: 'parasite', status: 'done', date: day(-1), items: [{ targets: ['worms'] }] }), params(cat))
    expect((await overview()).pet.vaccinated).toBe(false)
  })
})
