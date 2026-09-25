import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { DueItemSchema, HealthEventSchema, HealthOverviewSchema, IDEMPOTENCY_KEY_HEADER } from '@lapka/contracts'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import {
  DELETE as deleteEvent,
  PATCH as patchEvent,
} from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { POST as completeItem } from '@/app/(backend)/api/v1/pets/[id]/health/items/[itemId]/complete/route'
import { GET as listDue } from '@/app/(backend)/api/v1/pets/due/route'
import { PATCH as patchPet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures } from './fixtures'

// MR-03: vaccinations, plans and "done" against the real database.

let db: Client
let tokenA: string
let tokenB: string
const pet: string = PET_IDS.aCat

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(token: string, method: string, body?: unknown, key?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  if (key) headers[IDEMPOTENCY_KEY_HEADER] = key
  return new NextRequest('http://test.local/api/v1/x', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const eventParams = (id: string, eventId: string) => ({ params: Promise.resolve({ id, eventId }) })
const itemParams = (id: string, itemId: string) => ({ params: Promise.resolve({ id, itemId }) })

/** A day relative to today in UTC, as the server sees it. */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

const tricat = { name: 'Нобивак Tricat Trio', targets: ['panleukopenia', 'calicivirus', 'rhinotracheitis'] }
const rabies = { name: 'Нобивак Rabies', targets: ['rabies'] }

async function overview() {
  const response = await getHealth(request(tokenA, 'GET'), params(pet))
  return HealthOverviewSchema.parse(await response.json())
}

async function create(body: unknown, key?: string, token = tokenA) {
  return createEvent(request(token, 'POST', body, key), params(pet))
}

async function liveEvents(): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from public.pet_health_events where pet_id = $1 and deleted_at is null`,
    [pet],
  )
  return rows[0].n
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_health_events where pet_id = $1`, [pet])
})

afterAll(async () => {
  await db?.end()
})

describe('recording vaccinations', () => {
  it('two vaccines give one done record and two independent plans (MR-03.1)', async () => {
    const response = await create({
      kind: 'vaccination',
      status: 'done',
      date: day(-1),
      clinic: 'Айболит',
      items: [
        { ...tricat, next_on: day(364) },
        { ...rabies, next_on: day(364) },
      ],
    })
    expect(response.status).toBe(201)
    const done = HealthEventSchema.parse(await response.json())
    expect(done.status).toBe('done')
    expect(done.items.map((i) => i.name)).toEqual([tricat.name, rabies.name])

    const { events, writable } = await overview()
    expect(writable).toContain('vaccinations')
    const planned = events.filter((e) => e.status === 'planned')
    expect(planned).toHaveLength(1)
    expect(planned[0].date).toBe(day(364))
    expect(planned[0].items.map((i) => i.source_item_id).sort()).toEqual(done.items.map((i) => i.id).sort())
  })

  it('puts plans for different next days into different records', async () => {
    await create({
      kind: 'vaccination',
      status: 'done',
      date: day(-1),
      items: [
        { ...tricat, next_on: day(364) },
        { ...rabies, next_on: day(1000) },
        { name: null, targets: ['felv'], next_on: null },
      ],
    })
    const planned = (await overview()).events.filter((e) => e.status === 'planned').map((e) => e.date).sort()
    expect(planned).toEqual([day(364), day(1000)])
  })

  it('returns the same record for a repeated request instead of a second one', async () => {
    const body = { kind: 'vaccination', status: 'done', date: day(-1), items: [{ ...rabies, next_on: day(364) }] }
    const first = HealthEventSchema.parse(await (await create(body, 'repeat-key-1')).json())
    const second = HealthEventSchema.parse(await (await create(body, 'repeat-key-1')).json())
    expect(second.id).toBe(first.id)
    expect(await liveEvents()).toBe(2)
  })

  it('refuses a done record in the future and a plan in the past (MR-03.3)', async () => {
    expect((await create({ kind: 'vaccination', status: 'done', date: day(5), items: [rabies] })).status).toBe(400)
    expect((await create({ kind: 'vaccination', status: 'planned', date: day(-5), items: [rabies] })).status).toBe(400)
    expect((await create({ kind: 'vaccination', status: 'planned', date: day(0), items: [rabies] })).status).toBe(201)
  })

  it('leaves nothing behind when the database refuses part of a record (MR-03.5)', async () => {
    const { rows } = await db.query(`select user_id from public.pets where id = $1`, [pet])
    await expect(
      db.query(
        `select public.create_health_event($1, $2, 'vaccination', 'done', current_date, null, null, $3::jsonb, null)`,
        [rows[0].user_id, pet, JSON.stringify([{ name: 'ok', targets: [] }, { name: '', targets: [] }])],
      ),
    ).rejects.toThrow()
    expect(await liveEvents()).toBe(0)
  })

  it('refuses a next date that has already passed (review 2)', async () => {
    const response = await create({
      kind: 'vaccination',
      status: 'done',
      date: '2024-03-12',
      items: [{ ...rabies, next_on: '2025-03-12' }],
    })
    expect(response.status).toBe(400)
  })

  it('answers 409 when the same key comes back with different data (review 3)', async () => {
    const body = { kind: 'vaccination', status: 'done', date: day(-1), items: [{ ...rabies, next_on: day(364) }] }
    expect((await create(body, 'key-changed')).status).toBe(201)
    const changed = await create({ ...body, items: [{ ...rabies, next_on: null }] }, 'key-changed')
    expect(changed.status).toBe(409)
    expect(await liveEvents()).toBe(2)
  })

  it('refuses an empty idempotency key rather than treating it as one', async () => {
    const response = await createEvent(
      new NextRequest('http://test.local/x', {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: '' },
        body: JSON.stringify({ kind: 'vaccination', status: 'done', date: day(-1), items: [rabies] }),
      }),
      params(pet),
    )
    expect(response.status).toBe(400)
  })

  it('answers 404 for someone else’s pet', async () => {
    const response = await create({ kind: 'vaccination', status: 'done', date: day(-1), items: [rabies] }, undefined, tokenB)
    expect(response.status).toBe(404)
  })
})

describe('marking a plan done', () => {
  async function planTwo() {
    const response = await create({ kind: 'vaccination', status: 'planned', date: day(3), items: [tricat, rabies] })
    return HealthEventSchema.parse(await response.json())
  }

  it('moves only the item marked done and keeps the other planned (MR-03.2)', async () => {
    const plan = await planTwo()
    const [first, second] = plan.items

    const response = await completeItem(
      request(tokenA, 'POST', { done_on: day(0), next_on: day(365) }, 'done-key-1'),
      itemParams(pet, first.id),
    )
    expect(response.status).toBe(200)
    const done = HealthEventSchema.parse(await response.json())
    expect(done.status).toBe('done')
    expect(done.items.map((i) => i.id)).toEqual([first.id])

    const { events } = await overview()
    const stillPlanned = events.find((e) => e.id === plan.id)!
    expect(stillPlanned.status).toBe('planned')
    expect(stillPlanned.items.map((i) => i.id)).toEqual([second.id])
    const next = events.find((e) => e.status === 'planned' && e.date === day(365))!
    expect(next.items[0].source_item_id).toBe(first.id)
  })

  it('does not add anything when the same "done" is sent again (MR-03.2)', async () => {
    const plan = await planTwo()
    const body = { done_on: day(0), next_on: day(365) }
    await completeItem(request(tokenA, 'POST', body, 'done-key-2'), itemParams(pet, plan.items[0].id))
    const before = await liveEvents()

    await completeItem(request(tokenA, 'POST', body, 'done-key-2'), itemParams(pet, plan.items[0].id))
    await completeItem(request(tokenA, 'POST', body, 'done-key-3'), itemParams(pet, plan.items[0].id))
    expect(await liveEvents()).toBe(before)
  })

  it('turns a single-item plan into the done record itself', async () => {
    const plan = HealthEventSchema.parse(
      await (await create({ kind: 'vaccination', status: 'planned', date: day(3), items: [rabies] })).json(),
    )
    const done = HealthEventSchema.parse(
      await (await completeItem(request(tokenA, 'POST', { done_on: day(0) }), itemParams(pet, plan.items[0].id))).json(),
    )
    expect(done.id).toBe(plan.id)
    expect(done.date).toBe(day(0))
  })

  it('lets an overdue plan be moved or done (MR-03.3)', async () => {
    const plan = await planTwo()
    await db.query(`update public.pet_health_events set event_date = $2 where id = $1`, [plan.id, day(-30)])

    const moved = await patchEvent(request(tokenA, 'PATCH', { date: day(10) }), eventParams(pet, plan.id))
    expect(moved.status).toBe(200)
    await db.query(`update public.pet_health_events set event_date = $2 where id = $1`, [plan.id, day(-30)])
    const done = await completeItem(request(tokenA, 'POST', { done_on: day(0) }), itemParams(pet, plan.items[0].id))
    expect(done.status).toBe(200)
  })

  it('does not complete another pet’s item through this pet', async () => {
    const plan = await planTwo()
    const response = await completeItem(request(tokenA, 'POST', { done_on: day(0) }), itemParams(PET_IDS.aDog, plan.items[0].id))
    expect(response.status).toBe(404)
  })

  it('keeps the plan’s own key when a single-item plan is completed (review 4)', async () => {
    const body = { kind: 'vaccination', status: 'planned', date: day(3), items: [rabies] }
    const plan = HealthEventSchema.parse(await (await create(body, 'plan-key')).json())
    await completeItem(request(tokenA, 'POST', { done_on: day(0) }, 'done-key'), itemParams(pet, plan.items[0].id))
    const before = await liveEvents()
    await create(body, 'plan-key')
    expect(await liveEvents()).toBe(before)
  })

  it('refuses a next date in the past when a plan is marked done (review 2)', async () => {
    const plan = await planTwo()
    const response = await completeItem(
      request(tokenA, 'POST', { done_on: day(-400), next_on: day(-35) }),
      itemParams(pet, plan.items[0].id),
    )
    expect(response.status).toBe(400)
  })

  it('refuses to move a plan into the past or mark it done in the future', async () => {
    const plan = await planTwo()
    expect((await patchEvent(request(tokenA, 'PATCH', { date: day(-3) }), eventParams(pet, plan.id))).status).toBe(400)
    expect(
      (await completeItem(request(tokenA, 'POST', { done_on: day(5) }), itemParams(pet, plan.items[0].id))).status,
    ).toBe(400)
  })

  it('does not let another owner complete, move or cancel a plan (MR-03.5)', async () => {
    const plan = await planTwo()
    expect((await completeItem(request(tokenB, 'POST', { done_on: day(0) }), itemParams(pet, plan.items[0].id))).status).toBe(404)
    expect((await patchEvent(request(tokenB, 'PATCH', { date: day(20) }), eventParams(pet, plan.id))).status).toBe(404)
    expect((await deleteEvent(request(tokenB, 'DELETE'), eventParams(pet, plan.id))).status).toBe(404)
    const { events } = await overview()
    expect(events.find((e) => e.id === plan.id)?.date).toBe(day(3))
  })
})

describe('correcting, cancelling and listing', () => {
  it('replaces the items of a record and keeps plans made from it', async () => {
    const done = HealthEventSchema.parse(
      await (
        await create({ kind: 'vaccination', status: 'done', date: day(-1), items: [{ ...tricat, next_on: day(364) }, rabies] })
      ).json(),
    )
    const response = await patchEvent(
      request(tokenA, 'PATCH', { clinic: 'Вет-клиника', items: [{ id: done.items[0].id, name: 'Пуревакс RCP', targets: tricat.targets }] }),
      eventParams(pet, done.id),
    )
    expect(response.status).toBe(200)
    const fixed = HealthEventSchema.parse(await response.json())
    expect(fixed.clinic).toBe('Вет-клиника')
    expect(fixed.items.map((i) => i.name)).toEqual(['Пуревакс RCP'])
    expect((await overview()).events.filter((e) => e.status === 'planned')).toHaveLength(1)
  })

  it('cancels a plan and deletes a record', async () => {
    const plan = HealthEventSchema.parse(
      await (await create({ kind: 'vaccination', status: 'planned', date: day(3), items: [rabies] })).json(),
    )
    expect((await deleteEvent(request(tokenA, 'DELETE'), eventParams(pet, plan.id))).status).toBe(204)
    expect((await overview()).events).toEqual([])
  })

  it('marks the pet vaccinated once a vaccination is done, and gives back the owner’s answer when it goes (review 1)', async () => {
    await db.query(`update public.pets set vaccinated = false, vaccinated_form = false where id = $1`, [pet])
    const done = HealthEventSchema.parse(
      await (await create({ kind: 'vaccination', status: 'done', date: day(-1), items: [rabies] })).json(),
    )
    expect((await overview()).pet.vaccinated).toBe(true)

    // A plan alone says nothing about vaccination.
    await create({ kind: 'vaccination', status: 'planned', date: day(3), items: [rabies] })
    await deleteEvent(request(tokenA, 'DELETE'), eventParams(pet, done.id))
    expect((await overview()).pet.vaccinated).toBe(false)
  })

  it('keeps "vaccinated" while records say so, whatever the form is saved with', async () => {
    await db.query(`update public.pets set vaccinated = null, vaccinated_form = null where id = $1`, [pet])
    await create({ kind: 'vaccination', status: 'done', date: day(-1), items: [rabies] })
    await patchPet(request(tokenA, 'PATCH', { name: 'Мурка', vaccinated: false }), params(pet))
    const { rows } = await db.query(`select vaccinated, vaccinated_form from public.pets where id = $1`, [pet])
    expect(rows[0]).toEqual({ vaccinated: true, vaccinated_form: false })
  })

  it('lists every due date of the caller’s pets and nobody else’s', async () => {
    await create({ kind: 'vaccination', status: 'planned', date: day(3), items: [tricat, rabies] })
    const response = await listDue(request(tokenA, 'GET'), undefined)
    expect(response.status).toBe(200)
    const due = (await response.json()).map((row: unknown) => DueItemSchema.parse(row))
    expect(due.filter((row: { pet_id: string }) => row.pet_id === pet)).toHaveLength(2)

    const other = await (await listDue(request(tokenB, 'GET'), undefined)).json()
    expect(other.filter((row: { pet_id: string }) => row.pet_id === pet)).toEqual([])
  })
})
