import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { HealthEventSchema, HealthOverviewSchema, IDEMPOTENCY_KEY_HEADER, type HealthEvent } from '@lapka/contracts'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { DELETE as deleteEvent, PATCH as patchEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { POST as completeItem } from '@/app/(backend)/api/v1/pets/[id]/health/items/[itemId]/complete/route'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { createServiceClient } from '@/server/supabase/server'
import {
  blankEventDraft,
  changeDate,
  draftFromPlan,
  manualItem,
  noProductItem,
  readNewEvent,
  readPlanChange,
  switchStatus,
  toggleTarget,
  type EventDraft,
} from '@/features/medical-record/events/event-form'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// MW-03: the web vaccination form against the real database — what the form
// sends is what is stored; a done record is history (owner rule of
// 26 September 2026: PATCH refused with record_done, delete allowed); a plan
// is corrected in place; one Idempotency-Key never makes two records; owner
// B reaches none of owner A's records.

let db: Client
let owners: SeededFixtures
let tokenA: string
let tokenB: string
const pet = PET_IDS.aCat

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
  return new NextRequest('http://test.local/api/v1/x', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const eventParams = (id: string, eventId: string) => ({ params: Promise.resolve({ id, eventId }) })

/** A day relative to today in UTC, as the server sees it; the form is given the same today. */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = day(0)

async function overview(token = tokenA) {
  return HealthOverviewSchema.parse(await (await getHealth(request(token, 'GET'), params(pet))).json())
}

/** Two vaccines typed into the web form: the owner's own names, one with a next date. */
function twoVaccines(status: 'done' | 'planned', date: string): EventDraft {
  let draft = changeDate(switchStatus(blankEventDraft('vaccination', 'done', TODAY), status, TODAY), date, TODAY)
  const tricat = toggleTarget(toggleTarget({ ...manualItem('a', 'Нобивак Tricat Trio') }, 'panleukopenia'), 'calicivirus')
  const rabies = toggleTarget(manualItem('b', 'Нобивак Rabies'), 'rabies')
  draft = { ...draft, items: [status === 'done' ? { ...tricat, next: day(364), nextTouched: true } : tricat, rabies], clinic: 'Айболит' }
  return draft
}

async function save(draft: EventDraft, key = crypto.randomUUID(), token = tokenA) {
  const read = readNewEvent(draft, TODAY)
  if (!read.ok) throw new Error(`The form refused: ${JSON.stringify(read.problems)}`)
  return createEvent(request(token, 'POST', read.input, key), params(pet))
}

async function created(draft: EventDraft): Promise<HealthEvent> {
  const response = await save(draft)
  expect(response.status).toBe(201)
  return HealthEventSchema.parse(await response.json())
}

beforeAll(async () => {
  db = await connect()
  owners = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_health_events where pet_id = any($1)`, [[pet, PET_IDS.aDog, PET_IDS.bCat]])
})

afterAll(async () => {
  await db?.end()
})

describe('what the web form sends is what is stored (MW-03.1)', () => {
  it('saves two vaccines as one done record and plans the next date of the one that has it', async () => {
    const done = await created(twoVaccines('done', day(-1)))
    expect(done.items.map((item) => [item.name, item.targets])).toEqual([
      ['Нобивак Tricat Trio', ['panleukopenia', 'calicivirus']],
      ['Нобивак Rabies', ['rabies']],
    ])
    const record = await overview()
    expect(record.events.find((event) => event.id === done.id)).toEqual(done)
    const plans = record.events.filter((event) => event.status === 'planned')
    expect(plans.map((plan) => [plan.date, plan.items.map((item) => item.source_item_id)])).toEqual([[day(364), [done.items[0].id]]])
  })

  it('never sends a «Без препарата» item without a disease: the form stops it, and the contract would too', async () => {
    const draft = { ...blankEventDraft('vaccination', 'done', TODAY), items: [noProductItem('x')] }
    const read = readNewEvent(draft, TODAY)
    expect(read).toEqual({ ok: false, problems: { item: { x: { targets: 'empty' } } } })
    const forced = await createEvent(
      request(tokenA, 'POST', { kind: 'vaccination', status: 'done', date: TODAY, items: [{ name: null, targets: [] }] }, crypto.randomUUID()),
      params(pet),
    )
    expect(forced.status).toBe(400)
    expect((await overview()).events).toEqual([])
  })
})

describe('a done record is history (owner rule of 26 September 2026)', () => {
  it('refuses every change of a done vaccination or treatment with record_done, and changes nothing', async () => {
    const vaccination = await created(twoVaccines('done', day(-1)))
    const treatment = HealthEventSchema.parse(
      await (
        await createEvent(
          request(tokenA, 'POST', { kind: 'parasite', status: 'done', date: day(-2), items: [{ name: 'Бравекто', targets: ['fleas', 'ticks'] }] }, crypto.randomUUID()),
          params(pet),
        )
      ).json(),
    )
    for (const done of [vaccination, treatment]) {
      // What the phone's «Изменить» used to send, and single fields.
      for (const body of [
        { clinic: 'Другая', notes: 'x', items: done.items.map((item) => ({ id: item.id, name: item.name, targets: item.targets, product_id: null })) },
        { date: day(-3) },
        { notes: null },
      ]) {
        const response = await patchEvent(request(tokenA, 'PATCH', body), eventParams(pet, done.id))
        expect(response.status).toBe(409)
        expect((await response.json()).error).toMatchObject({ code: 'record_done' })
      }
    }
    const after = await overview()
    expect(after.events.find((event) => event.id === vaccination.id)).toEqual(vaccination)
    expect(after.events.find((event) => event.id === treatment.id)).toEqual(treatment)
  })

  it('still deletes a wrong done record', async () => {
    const done = await created(twoVaccines('done', day(-1)))
    expect((await deleteEvent(request(tokenA, 'DELETE'), eventParams(pet, done.id))).status).toBe(204)
    expect((await overview()).events.some((event) => event.id === done.id)).toBe(false)
  })

  it('lets «Сделано» turn a plan into a done record, which is then read-only', async () => {
    const plan = await created({ ...twoVaccines('planned', day(10)), items: [toggleTarget(manualItem('r', 'Нобивак Rabies'), 'rabies')] })
    const completed = await completeItem(
      request(tokenA, 'POST', { done_on: TODAY }, crypto.randomUUID()),
      { params: Promise.resolve({ id: pet, itemId: plan.items[0].id }) },
    )
    expect(completed.status).toBe(200)
    const done = HealthEventSchema.parse(await completed.json())
    expect(done).toMatchObject({ id: plan.id, status: 'done', date: TODAY })
    const refused = await patchEvent(request(tokenA, 'PATCH', { clinic: 'x' }), eventParams(pet, plan.id))
    expect(refused.status).toBe(409)
    expect(await findHealthRecord(createServiceClient(), owners.ownerAId, pet, plan.id)).toEqual({ kind: 'vaccination', status: 'done' })
  })
})

describe('a plan is corrected in place (MW-03.1)', () => {
  it('keeps the plan’s id and its items’ ids when the form moves it and changes its clinic', async () => {
    const plan = await created(twoVaccines('planned', day(30)))
    const draft = { ...changeDate(draftFromPlan(plan), day(45), TODAY), clinic: 'Вет-клиника' }
    const read = readPlanChange(plan, draft, TODAY)
    if (!read.ok || !read.patch) throw new Error('the form found nothing to send')
    expect(read.patch).toEqual({ date: day(45), clinic: 'Вет-клиника' })

    const response = await patchEvent(request(tokenA, 'PATCH', read.patch), eventParams(pet, plan.id))
    expect(response.status).toBe(200)
    const moved = HealthEventSchema.parse(await response.json())
    expect(moved.id).toBe(plan.id)
    expect(moved.date).toBe(day(45))
    expect(moved.items).toEqual(plan.items)
  })

  it('sends nothing for a plan opened and saved unchanged, even an overdue one', async () => {
    const plan = await created(twoVaccines('planned', day(30)))
    await db.query(`update public.pet_health_events set event_date = $2 where id = $1`, [plan.id, day(-5)])
    const overdue = (await overview()).events.find((event) => event.id === plan.id)!
    expect(readPlanChange(overdue, draftFromPlan(overdue), TODAY)).toEqual({ ok: true, patch: null })
  })
})

describe('one Idempotency-Key, one record (MW-03.4)', () => {
  it('stores one record for the same save sent twice, and refuses the key with other data', async () => {
    const key = crypto.randomUUID()
    const first = await save(twoVaccines('done', day(-1)), key)
    const again = await save(twoVaccines('done', day(-1)), key)
    expect(first.status).toBe(201)
    expect(again.status).toBe(201)
    expect(HealthEventSchema.parse(await again.json()).id).toBe(HealthEventSchema.parse(await first.json()).id)
    expect((await overview()).events.filter((event) => event.status === 'done')).toHaveLength(1)

    const changed = await save({ ...twoVaccines('done', day(-1)), clinic: 'Другая' }, key)
    expect(changed.status).toBe(409)
    expect((await changed.json()).error.code).toBe('conflict')
    expect((await overview()).events.filter((event) => event.status === 'done')).toHaveLength(1)
  })
})

describe('owner B reaches none of owner A’s records (MW-03 access)', () => {
  it('cannot read, correct or delete them, through the API or the record pages’ lookup', async () => {
    const plan = await created(twoVaccines('planned', day(30)))
    const done = await created(twoVaccines('done', day(-1)))

    const read = await getHealth(request(tokenB, 'GET'), params(pet))
    expect(read.status).toBe(404)
    for (const id of [plan.id, done.id]) {
      expect((await patchEvent(request(tokenB, 'PATCH', { clinic: 'взлом' }), eventParams(pet, id))).status).toBe(404)
      expect((await deleteEvent(request(tokenB, 'DELETE'), eventParams(pet, id))).status).toBe(404)
      // B's own pet with A's record id.
      expect((await patchEvent(request(tokenB, 'PATCH', { clinic: 'взлом' }), eventParams(PET_IDS.bCat, id))).status).toBe(404)
    }
    const service = createServiceClient()
    expect(await findHealthRecord(service, owners.ownerBId, pet, plan.id)).toBeNull()
    expect(await findHealthRecord(service, owners.ownerBId, PET_IDS.bCat, plan.id)).toBeNull()
    expect(await findHealthRecord(service, owners.ownerAId, PET_IDS.aDog, plan.id)).toBeNull()
    expect(await findHealthRecord(service, owners.ownerAId, pet, plan.id)).toEqual({ kind: 'vaccination', status: 'planned' })

    const after = await overview()
    expect(after.events.find((event) => event.id === plan.id)).toEqual(plan)
    expect(after.events.find((event) => event.id === done.id)).toEqual(done)
  })
})
