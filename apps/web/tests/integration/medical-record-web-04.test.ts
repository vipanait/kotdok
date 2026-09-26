import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import {
  DueItemSchema,
  HealthEventSchema,
  HealthOverviewSchema,
  IDEMPOTENCY_KEY_HEADER,
  type HealthEvent,
  type HealthProduct,
} from '@lapka/contracts'
import { completionMismatch, dueEntries, nextDayOf } from '@lapka/shared'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { DELETE as deleteEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { POST as completeItem } from '@/app/(backend)/api/v1/pets/[id]/health/items/[itemId]/complete/route'
import { GET as listDue } from '@/app/(backend)/api/v1/pets/due/route'
import { changeDoneDay, completeDraft, readCompletion } from '@/features/medical-record/events/complete-form'
import { blankEventDraft, productItem, readNewEvent, type EventDraft } from '@/features/medical-record/events/event-form'
import { FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures } from './fixtures'

// MW-04: treatments and «Сделано» against the real database. What the web
// forms send is what is stored: «Сделано» marks one item and plans its next
// date in the interval's own unit; cancelling a plan takes only its due date;
// a repeated «Сделано» adds nothing; a failure changes nothing; the due list
// keeps one order on the server and in the shared helper; owner B reaches
// none of it.

let db: Client
let tokenA: string
let tokenB: string
const pet = PET_IDS.aCat
const products: Record<string, HealthProduct> = {}

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
const itemParams = (id: string, itemId: string) => ({ params: Promise.resolve({ id, itemId }) })

/** A day relative to today in UTC, as the server sees it; the forms are given the same today. */
// One reading of the clock for the whole file: TODAY and every day(n) are
// counted from it, so a run across midnight UTC cannot mix two todays.
const NOW = Date.now()
function day(offset: number): string {
  return new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = day(0)

/** Days added by hand, not by the shared helper the forms use. */
function plusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

async function overview(token = tokenA) {
  return HealthOverviewSchema.parse(await (await getHealth(request(token, 'GET'), params(pet))).json())
}

async function due(token = tokenA) {
  const body = await (await listDue(request(token, 'GET'), undefined)).json()
  return DueItemSchema.array().parse(body)
}

async function liveCounts() {
  const { rows } = await db.query(
    `select (select count(*) from public.pet_health_events where pet_id = $1 and deleted_at is null)::int as events,
            (select count(*) from public.pet_health_items where pet_id = $1 and deleted_at is null)::int as items`,
    [pet],
  )
  return rows[0] as { events: number; items: number }
}

/** Two treatments in one done record, typed into the web form: each product brings its own interval. */
function twoTreatments(date: string): EventDraft {
  const draft = { ...blankEventDraft('parasite', 'done', TODAY), date }
  return {
    ...draft,
    items: [productItem('spot-on', products.spotOn, draft, TODAY), productItem('tablet', products.tablet, draft, TODAY)],
    clinic: 'Айболит',
  }
}

async function created(draft: EventDraft, key = crypto.randomUUID()): Promise<HealthEvent> {
  const read = readNewEvent(draft, TODAY)
  if (!read.ok) throw new Error(`The form refused: ${JSON.stringify(read)}`)
  const response = await createEvent(request(tokenA, 'POST', read.input, key), params(pet))
  expect(response.status).toBe(201)
  return HealthEventSchema.parse(await response.json())
}

/** «Сделано» on one item through the web form's own reading of its fields. */
async function complete(plan: HealthEvent, itemIndex: number, doneOn: string, key = crypto.randomUUID(), token = tokenA) {
  const item = plan.items[itemIndex]
  const draft = changeDoneDay(completeDraft(plan, item, TODAY), item, doneOn, TODAY)
  const read = readCompletion(draft, TODAY)
  if (!read.ok) throw new Error(`The form refused: ${JSON.stringify(read)}`)
  return { input: read.input, response: await completeItem(request(token, 'POST', read.input, key), itemParams(pet, item.id)) }
}

beforeAll(async () => {
  db = await connect()
  await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
  await db.query(`delete from public.health_products where name like 'MW04 %'`)
  const { rows } = await db.query(
    `insert into public.health_products (kind, name, manufacturer, aliases, species, form, targets, interval_value, interval_unit, popularity, verified) values
       ('antiparasitic', 'MW04 Спот-он', 'MSD', '{}', array['cat','dog'], 'drops', array['fleas','ticks'], 12, 'week', null, true),
       ('antiparasitic', 'MW04 Таблетка', 'Elanco', '{}', array['cat','dog'], 'tablet', array['worms'], 3, 'month', null, true)
     returning id, name, manufacturer, species, form, targets, interval_value, interval_unit`,
  )
  const toProduct = (row: (typeof rows)[number]): HealthProduct => ({
    id: row.id,
    kind: 'antiparasitic',
    name: row.name,
    manufacturer: row.manufacturer,
    aliases: [],
    species: row.species,
    form: row.form,
    targets: row.targets,
    interval: { value: row.interval_value, unit: row.interval_unit },
    popular: false,
  })
  products.spotOn = toProduct(rows.find((row) => row.name === 'MW04 Спот-он'))
  products.tablet = toProduct(rows.find((row) => row.name === 'MW04 Таблетка'))
})

beforeEach(async () => {
  await db.query(`delete from public.pet_health_events where pet_id = any($1)`, [[pet, PET_IDS.aDog, PET_IDS.bCat]])
})

afterAll(async () => {
  await db.query(`delete from public.pet_health_events where pet_id = any($1)`, [[pet, PET_IDS.aDog, PET_IDS.bCat]])
  await db.query(`delete from public.health_products where name like 'MW04 %'`)
  await db?.end()
})

describe('two treatments with their own next dates; «Сделано» on one (MW-04.1)', () => {
  it('plans each item on its own day, and «Сделано» on one leaves the other due', async () => {
    const done = await created(twoTreatments(day(-2)))
    // Each item its own date — 12 weeks and 3 months: two plans, two due dates.
    const plans = (await overview()).events.filter((event) => event.status === 'planned')
    const spotOnPlan = plans.find((plan) => plan.items[0].name === 'MW04 Спот-он')!
    const tabletPlan = plans.find((plan) => plan.items[0].name === 'MW04 Таблетка')!
    expect(plans).toHaveLength(2)
    expect(spotOnPlan.date).toBe(plusDays(day(-2), 84))
    expect(tabletPlan.date).not.toBe(spotOnPlan.date)
    expect([spotOnPlan.items[0].source_item_id, tabletPlan.items[0].source_item_id]).toEqual(done.items.map((item) => item.id))
    expect((await due()).filter((entry) => entry.pet_id === pet).map((entry) => entry.item_id).sort()).toEqual(
      [spotOnPlan.items[0].id, tabletPlan.items[0].id].sort(),
    )

    const { response } = await complete(spotOnPlan, 0, TODAY)
    expect(response.status).toBe(200)
    const marked = HealthEventSchema.parse(await response.json())
    expect([marked.status, marked.date, marked.kind]).toEqual(['done', TODAY, 'parasite'])

    const after = await overview()
    const dueNow = (await due()).filter((entry) => entry.pet_id === pet)
    // The other treatment is still due, untouched; the marked one is not, and its next plan is.
    expect(dueNow.some((entry) => entry.item_id === tabletPlan.items[0].id && entry.date === tabletPlan.date)).toBe(true)
    expect(dueNow.some((entry) => entry.item_id === spotOnPlan.items[0].id)).toBe(false)
    expect(after.events.find((event) => event.id === tabletPlan.id)).toEqual(tabletPlan)
    const nextPlan = after.events.find((event) => event.status === 'planned' && event.items[0].source_item_id === spotOnPlan.items[0].id)
    expect(nextPlan?.date).toBe(plusDays(TODAY, 84))
    // History: the first record as it was, plus the new done one.
    expect(after.events.find((event) => event.id === done.id)).toEqual(done)
    expect(after.events.filter((event) => event.status === 'done').map((event) => event.id).sort()).toEqual([done.id, marked.id].sort())
  })

  it('marks one vaccine of a plan of two done; the other stays planned (Сделано for vaccinations)', async () => {
    const plan = HealthEventSchema.parse(
      await (
        await createEvent(
          request(tokenA, 'POST', {
            kind: 'vaccination',
            status: 'planned',
            date: day(10),
            items: [
              { name: 'Нобивак Tricat Trio', targets: ['panleukopenia', 'calicivirus', 'rhinotracheitis'] },
              { name: 'Нобивак Rabies', targets: ['rabies'] },
            ],
          }, crypto.randomUUID()),
          params(pet),
        )
      ).json(),
    )
    const { response } = await complete(plan, 1, TODAY)
    expect(response.status).toBe(200)
    const marked = HealthEventSchema.parse(await response.json())
    expect(marked.items.map((item) => item.id)).toEqual([plan.items[1].id])
    const still = (await overview()).events.find((event) => event.id === plan.id)!
    expect([still.status, still.date, still.items.map((item) => item.id)]).toEqual(['planned', day(10), [plan.items[0].id]])
  })
})

describe('the next date follows the interval’s unit (MW-04.2)', () => {
  it('12 weeks is 84 days after the day it was done, 3 months is the same day three months on', async () => {
    const done = await created({ ...twoTreatments(day(-2)), items: twoTreatments(day(-2)).items.slice(0, 1) })
    const plan = (await overview()).events.find((event) => event.status === 'planned')!
    expect(plan.items[0].interval).toEqual({ value: 12, unit: 'week' })

    const doneOn = day(-1)
    const { input } = await complete(plan, 0, doneOn)
    expect(input.next_on).toBe(plusDays(doneOn, 84))
    const next = (await overview()).events.find((event) => event.status === 'planned' && event.items[0].source_item_id === plan.items[0].id)
    expect(next?.date).toBe(plusDays(doneOn, 84))
    expect(next?.items[0].interval).toEqual({ value: 12, unit: 'week' })
    // The plan it came from is the done record now: the first record's item has no plan left.
    expect(nextDayOf(done.items[0].id, (await overview()).events)).toBeNull()

    const [year, month, date] = doneOn.split('-').map(Number)
    const threeMonths = await created({ ...twoTreatments(doneOn), items: twoTreatments(doneOn).items.slice(1) })
    const tabletPlan = (await overview()).events.find(
      (event) => event.status === 'planned' && event.items[0].source_item_id === threeMonths.items[0].id,
    )!
    const expected = new Date(Date.UTC(year, month - 1 + 3, 1))
    const last = new Date(Date.UTC(expected.getUTCFullYear(), expected.getUTCMonth() + 1, 0)).getUTCDate()
    expected.setUTCDate(Math.min(date, last))
    expect(tabletPlan.date).toBe(expected.toISOString().slice(0, 10))
  })
})

describe('cancelling a plan (MW-04.3)', () => {
  it('takes only that due date away; the done history stays as it was', async () => {
    const done = await created(twoTreatments(day(-2)))
    const before = await overview()
    const [first, second] = before.events.filter((event) => event.status === 'planned')

    const cancelled = await deleteEvent(request(tokenA, 'DELETE'), eventParams(pet, first.id))
    expect(cancelled.status).toBe(204)

    const after = await overview()
    expect(after.events.find((event) => event.id === first.id)).toBeUndefined()
    expect(after.events.find((event) => event.id === second.id)).toEqual(second)
    expect(after.events.find((event) => event.id === done.id)).toEqual(done)
    expect(after.events.filter((event) => event.status === 'done')).toHaveLength(1)
    const dueNow = (await due()).filter((entry) => entry.pet_id === pet)
    expect(dueNow.map((entry) => entry.event_id)).toEqual([second.id])
  })
})

describe('«Сделано» again, and failures (MW-04.4)', () => {
  it('adds nothing when the same «Сделано» is sent twice, or again with a new key', async () => {
    await created(twoTreatments(day(-2)))
    const plan = (await overview()).events.find((event) => event.status === 'planned')!
    const key = crypto.randomUUID()
    const first = await complete(plan, 0, TODAY, key)
    expect(first.response.status).toBe(200)
    const marked = HealthEventSchema.parse(await first.response.json())
    const counts = await liveCounts()

    // The answer was lost: the form sends the same key again.
    const retry = await complete(plan, 0, TODAY, key)
    expect(retry.response.status).toBe(200)
    expect(HealthEventSchema.parse(await retry.response.json()).id).toBe(marked.id)
    // Another device, or a new press after success: a new key, still nothing new.
    const again = await complete(plan, 0, TODAY)
    expect(again.response.status).toBe(200)
    expect(HealthEventSchema.parse(await again.response.json()).id).toBe(marked.id)
    expect(await liveCounts()).toEqual(counts)
  })

  it('a plan of one item: the same key with an edited day answers 200 with the first record — the form sees it is not what it sent', async () => {
    await created(twoTreatments(day(-2)))
    const plan = (await overview()).events.find((event) => event.status === 'planned' && event.items.length === 1)!
    const key = crypto.randomUUID()
    const first = await complete(plan, 0, day(-1), key)
    expect(first.response.status).toBe(200)
    const firstRecord = HealthEventSchema.parse(await first.response.json())
    expect(completionMismatch(first.input, firstRecord, plan.items[0].id, (await overview()).events)).toBeNull()
    const counts = await liveCounts()

    // The answer was lost; the owner moved the day to today and saved again with the same key.
    const edited = await complete(plan, 0, TODAY, key)
    expect(edited.input.done_on).toBe(TODAY)
    // The server does not refuse: the item is done, it answers with that record as it was.
    expect(edited.response.status).toBe(200)
    const answered = HealthEventSchema.parse(await edited.response.json())
    expect([answered.id, answered.date]).toEqual([firstRecord.id, day(-1)])
    expect(completionMismatch(edited.input, answered, plan.items[0].id, (await overview()).events)).toBe('doneOn')
    expect(await liveCounts()).toEqual(counts)

    // The same day, the next date cleared: the stored next plan is not the one sent.
    const cleared = await completeItem(
      request(tokenA, 'POST', { ...first.input, next_on: null }, crypto.randomUUID()),
      itemParams(pet, plan.items[0].id),
    )
    expect(cleared.status).toBe(200)
    const again = HealthEventSchema.parse(await cleared.json())
    expect(completionMismatch({ ...first.input, next_on: null }, again, plan.items[0].id, (await overview()).events)).toBe('next')
    // An exact retry is still success.
    expect(completionMismatch(first.input, again, plan.items[0].id, (await overview()).events)).toBeNull()
  })

  it('keeps the plan’s clinic and note when the fields come empty — why the form says so', async () => {
    const plan = HealthEventSchema.parse(
      await (
        await createEvent(
          request(tokenA, 'POST', { kind: 'parasite', status: 'planned', date: day(5), clinic: 'Айболит', notes: 'Капать на холку', items: [{ name: 'А', targets: ['fleas'] }] }, crypto.randomUUID()),
          params(pet),
        )
      ).json(),
    )
    const response = await completeItem(request(tokenA, 'POST', { done_on: TODAY, clinic: null, notes: null }, crypto.randomUUID()), itemParams(pet, plan.items[0].id))
    const done = HealthEventSchema.parse(await response.json())
    expect([done.clinic, done.notes]).toEqual(['Айболит', 'Капать на холку'])
  })

  it('answers conflict when the same key comes with other data after a lost answer, and adds nothing', async () => {
    const plan = HealthEventSchema.parse(
      await (
        await createEvent(
          request(tokenA, 'POST', { kind: 'parasite', status: 'planned', date: day(5), items: [{ name: 'А', targets: ['fleas'] }, { name: 'Б', targets: ['worms'] }] }, crypto.randomUUID()),
          params(pet),
        )
      ).json(),
    )
    const key = crypto.randomUUID()
    expect((await complete(plan, 0, TODAY, key)).response.status).toBe(200)
    const counts = await liveCounts()
    const changed = await completeItem(request(tokenA, 'POST', { done_on: day(-1) }, key), itemParams(pet, plan.items[0].id))
    expect(changed.status).toBe(409)
    expect((await changed.json()).error.code).toBe('conflict')
    expect(await liveCounts()).toEqual(counts)
  })

  it('refuses a day after today or a next date not after it, and changes nothing', async () => {
    await created(twoTreatments(day(-2)))
    const before = await overview()
    const plan = before.events.find((event) => event.status === 'planned')!
    const future = await completeItem(request(tokenA, 'POST', { done_on: day(3) }, crypto.randomUUID()), itemParams(pet, plan.items[0].id))
    expect(future.status).toBe(400)
    const notAfter = await completeItem(
      request(tokenA, 'POST', { done_on: TODAY, next_on: TODAY }, crypto.randomUUID()),
      itemParams(pet, plan.items[0].id),
    )
    expect(notAfter.status).toBe(400)
    expect((await overview()).events).toEqual(before.events)
  })

  it('answers 404 for an item of a plan cancelled meanwhile', async () => {
    await created(twoTreatments(day(-2)))
    const plan = (await overview()).events.find((event) => event.status === 'planned')!
    await deleteEvent(request(tokenA, 'DELETE'), eventParams(pet, plan.id))
    const counts = await liveCounts()
    expect((await complete(plan, 0, TODAY)).response.status).toBe(404)
    expect(await liveCounts()).toEqual(counts)
  })
})

describe('one order for the due list (server and shared helper)', () => {
  it('lists the pet’s due dates in the order the record and «Все сроки» show them', async () => {
    const plan = (date: string, name: string, kind = 'parasite') =>
      createEvent(
        request(tokenA, 'POST', { kind, status: 'planned', date, items: [{ name, targets: kind === 'parasite' ? ['fleas'] : ['rabies'] }] }, crypto.randomUUID()),
        params(pet),
      )
    await plan(day(30), 'Поздний')
    await plan(day(3), 'Скоро')
    await plan(day(3), 'Скоро вакцина', 'vaccination')
    const overdue = HealthEventSchema.parse(await (await plan(day(4), 'Просрочен')).json())
    await db.query(`update public.pet_health_events set event_date = $2 where id = $1`, [overdue.id, day(-10)])

    const server = (await due()).filter((entry) => entry.pet_id === pet).map((entry) => entry.item_id)
    const shared = dueEntries((await overview()).events).map((entry) => entry.key)
    expect(server).toEqual(shared)
    expect(server[0]).toBe(overdue.items[0].id)
  })
})

describe('owner B', () => {
  it('cannot mark owner A’s plan done, and does not see its due dates', async () => {
    await created(twoTreatments(day(-2)))
    const plan = (await overview()).events.find((event) => event.status === 'planned')!
    const counts = await liveCounts()
    expect((await complete(plan, 0, TODAY, crypto.randomUUID(), tokenB)).response.status).toBe(404)
    expect((await due(tokenB)).some((entry) => entry.pet_id === pet)).toBe(false)
    expect(await liveCounts()).toEqual(counts)
  })
})
