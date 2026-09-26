import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { DueItemSchema, HealthEventSchema, HealthOverviewSchema, IDEMPOTENCY_KEY_HEADER, type HealthEvent } from '@lapka/contracts'
import { reasonFromCheck } from '@lapka/shared'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as createVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/route'
import { PATCH as patchVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/[eventId]/route'
import { DELETE as deleteEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { POST as toMedication } from '@/app/(backend)/api/v1/pets/[id]/health/items/[itemId]/medication/route'
import { GET as listDue } from '@/app/(backend)/api/v1/pets/due/route'
import { blankPrescription, blankVisit, draftFromPlan, heldDraft, readHeld, readNewVisit, readPlanChange } from '@/features/medical-record/visits/visit-form'
import { findHealthRecord } from '@/server/medical-record/record-lookup'
import { createServiceClient } from '@/server/supabase/server'
import { CHECK_IDS, FIXTURE_PASSWORD, OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// MW-06: vet visits and the link to a check, against the real database,
// through what the web form sends. A visit from a check result carries that
// check and only that; prescriptions stay after a reload and one ticked for
// the medicines is one course however often the save or the action is
// repeated; a visit that happened is history — every change of it is
// `record_done`, except the very save that made it happen sent again with
// its key; a plan is marked held, cancelled or moved and the due dates follow;
// owner B reaches none of it.

let db: Client
let tokenA: string
let tokenB: string
let owners: SeededFixtures
const cat: string = PET_IDS.aCat

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(token: string, method = 'GET', body?: unknown, key?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  if (key) headers[IDEMPOTENCY_KEY_HEADER] = key
  return new NextRequest('http://test.local/x', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const eventParams = (eventId: string, id: string = cat) => ({ params: Promise.resolve({ id, eventId }) })
const itemParams = (itemId: string, id: string = cat) => ({ params: Promise.resolve({ id, itemId }) })

/** A day relative to today in UTC, as the server sees it; the forms are given the same today. */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = day(0)

async function overview(token = tokenA) {
  return HealthOverviewSchema.parse(await (await getHealth(request(token), params(cat))).json())
}

async function courses(): Promise<Array<{ name: string; visit_item_id: string | null; started_on: string | null }>> {
  const { rows } = await db.query(
    `select name, visit_item_id, started_on::text from public.pet_medications where pet_id = $1 and deleted_at is null order by name`,
    [cat],
  )
  return rows
}

async function visitRows(): Promise<number> {
  const { rows } = await db.query(`select count(*)::int as n from public.pet_health_events where pet_id = $1 and kind = 'visit' and deleted_at is null`, [cat])
  return rows[0].n
}

async function saved(response: Response): Promise<HealthEvent> {
  expect(response.status).toBeLessThan(300)
  return HealthEventSchema.parse(await response.json())
}

async function newVisit(body: unknown, key = crypto.randomUUID()): Promise<HealthEvent> {
  return saved(await createVisit(request(tokenA, 'POST', body, key), params(cat)))
}

async function plan(date = day(7)): Promise<HealthEvent> {
  const read = readNewVisit({ ...blankVisit(TODAY), status: 'planned', date, reason: 'Контрольный осмотр' }, TODAY)
  if (!read.ok) throw new Error('the form refused the plan')
  return newVisit(read.value)
}

async function due(token = tokenA) {
  const body = await (await listDue(request(token), undefined)).json()
  return DueItemSchema.array().parse(body.items ?? body)
}

beforeAll(async () => {
  db = await connect()
  owners = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_medications where pet_id = $1`, [cat])
  await db.query(`delete from public.pet_health_events where pet_id = $1`, [cat])
})

afterAll(async () => {
  await db?.end()
})

describe('criterion 1: a visit from a check result, and one made directly', () => {
  it('only the visit from the result is linked to that check; the direct one has none', async () => {
    const { rows } = await db.query(`select symptoms_input from public.symptom_checks where id = $1`, [CHECK_IDS.aFirst])
    const fromResult = readNewVisit(blankVisit(TODAY, { checkId: CHECK_IDS.aFirst, reason: reasonFromCheck(rows[0].symptoms_input) }), TODAY)
    const direct = readNewVisit(blankVisit(TODAY), TODAY)
    if (!fromResult.ok || !direct.ok) throw new Error('the form refused a visit')

    const linked = await newVisit(fromResult.value)
    const plain = await newVisit(direct.value)
    expect(linked).toMatchObject({ check_id: CHECK_IDS.aFirst, visit_kind: 'illness', status: 'done', date: TODAY })
    expect(linked.reason).toBe(reasonFromCheck(rows[0].symptoms_input))
    expect(plain.check_id).toBeNull()

    const read = await overview()
    expect(read.events.filter((e) => e.kind === 'visit').map((e) => [e.id, e.check_id]).sort()).toEqual(
      [
        [linked.id, CHECK_IDS.aFirst],
        [plain.id, null],
      ].sort(),
    )
  })

  it('refuses a check of another owner, a deleted one and one of another pet', async () => {
    for (const checkId of [CHECK_IDS.bOnly, CHECK_IDS.bDeleted, CHECK_IDS.aSecond]) {
      const read = readNewVisit(blankVisit(TODAY, { checkId, reason: '' }), TODAY)
      if (!read.ok) throw new Error('the form refused a visit')
      expect((await createVisit(request(tokenA, 'POST', read.value, crypto.randomUUID()), params(cat))).status).toBe(400)
    }
    expect(await visitRows()).toBe(0)
  })
})

describe('criterion 2: two prescriptions; the chosen one is a course, once', () => {
  it('both prescriptions are there after a reload; only the ticked one is in the medicines, exactly once', async () => {
    const draft = {
      ...blankVisit(TODAY),
      diagnosis: 'Обострение гастрита',
      prescriptions: [
        { ...blankPrescription('a'), name: 'Фортифлора', instructions: '1 пакетик в день, 14 дней', toMedicines: true },
        // Ticked by default; the owner unticked it.
        { ...blankPrescription('b'), name: 'Лечебный корм', instructions: 'Постоянно', toMedicines: false },
      ],
    }
    const read = readNewVisit(draft, TODAY)
    if (!read.ok) throw new Error('the form refused the visit')
    const visit = await newVisit(read.value)

    const reloaded = (await overview()).events.find((e) => e.id === visit.id)!
    expect(reloaded.items.map((i) => [i.name, i.instructions])).toEqual([
      ['Фортифлора', '1 пакетик в день, 14 дней'],
      ['Лечебный корм', 'Постоянно'],
    ])
    const fortiflora = reloaded.items[0]
    expect(fortiflora.medication_id).not.toBeNull()
    expect(reloaded.items[1].medication_id).toBeNull()
    expect(await courses()).toEqual([{ name: 'Фортифлора', visit_item_id: fortiflora.id, started_on: TODAY }])
    // «Принимает сейчас» reads the same list.
    expect((await overview()).medications.map((m) => m.name)).toEqual(['Фортифлора'])
  })

  it('a new prescription is ticked by default and becomes a course; one the owner unticks does not', async () => {
    const ticked = readNewVisit({ ...blankVisit(TODAY), prescriptions: [{ ...blankPrescription('a'), name: 'Смекта' }] }, TODAY)
    const unticked = readNewVisit({ ...blankVisit(TODAY), prescriptions: [{ ...blankPrescription('a'), name: 'Энтерофурил', toMedicines: false }] }, TODAY)
    if (!ticked.ok || !unticked.ok) throw new Error('the form refused the visit')
    expect(ticked.value.prescriptions).toEqual([{ name: 'Смекта', instructions: null, add_to_medications: true }])
    await newVisit(ticked.value)
    await newVisit(unticked.value)
    expect((await courses()).map((c) => c.name)).toEqual(['Смекта'])
  })
})

describe('criterion 3: repeating never multiplies; a visit that happened is not changed', () => {
  const body = () => {
    const read = readNewVisit(
      {
        ...blankVisit(TODAY),
        prescriptions: [
          { ...blankPrescription('a'), name: 'Фортифлора', toMedicines: true },
          { ...blankPrescription('b'), name: 'Смекта', toMedicines: false },
        ],
      },
      TODAY,
    )
    if (!read.ok) throw new Error('the form refused the visit')
    return read.value
  }

  it('the same save sent again (lost answer, second press) is one visit, two prescriptions, one course', async () => {
    const key = crypto.randomUUID()
    const first = await newVisit(body(), key)
    const again = await newVisit(body(), key)
    const third = await newVisit(body(), key)
    expect([again.id, third.id]).toEqual([first.id, first.id])
    expect(await visitRows()).toBe(1)
    expect((await overview()).events.find((e) => e.id === first.id)!.items).toHaveLength(2)
    expect(await courses()).toHaveLength(1)
    // The same key with other data is refused, not stored.
    const other = await createVisit(request(tokenA, 'POST', { ...body(), clinic: 'Другая' }, key), params(cat))
    expect(other.status).toBe(409)
    expect(await visitRows()).toBe(1)
  })

  it('«Добавить в лекарства» twice, and at once, is one course with one id', async () => {
    const visit = await newVisit(body())
    const smecta = visit.items.find((i) => i.name === 'Смекта')!
    const answers = await Promise.all([1, 2, 3].map(() => toMedication(request(tokenA, 'POST'), itemParams(smecta.id))))
    expect(answers.map((a) => a.status)).toEqual([201, 201, 201])
    const ids = new Set(await Promise.all(answers.map(async (a) => (await a.json()).medication_id)))
    expect(ids.size).toBe(1)
    const later = await toMedication(request(tokenA, 'POST'), itemParams(smecta.id))
    expect(ids.has((await later.json()).medication_id)).toBe(true)
    expect((await courses()).map((c) => c.name)).toEqual(['Смекта', 'Фортифлора'])
  })

  it('«Состоялся» sent again with its key answers the visit, adds nothing; a new change is record_done', async () => {
    const planned = await plan()
    const read = readHeld(
      planned,
      { ...heldDraft(planned, TODAY), diagnosis: 'Здорова', prescriptions: [{ ...blankPrescription('a'), name: 'Витамины', toMedicines: true }] },
      TODAY,
    )
    if (!read.ok) throw new Error('the form refused «Состоялся»')
    const key = crypto.randomUUID()
    const first = await patchVisit(request(tokenA, 'PATCH', read.value, key), eventParams(planned.id))
    expect(first.status).toBe(200)
    const again = await patchVisit(request(tokenA, 'PATCH', read.value, key), eventParams(planned.id))
    expect(again.status).toBe(200)
    expect(HealthEventSchema.parse(await again.json())).toMatchObject({ status: 'done', diagnosis: 'Здорова' })
    expect((await overview()).events.find((e) => e.id === planned.id)!.items.map((i) => i.name)).toEqual(['Витамины'])
    expect(await courses()).toHaveLength(1)

    const changed = await patchVisit(request(tokenA, 'PATCH', { diagnosis: 'Гастрит' }, crypto.randomUUID()), eventParams(planned.id))
    expect(changed.status).toBe(409)
    expect((await changed.json()).error.code).toBe('record_done')
  })

  it('every change of a visit that happened is refused (409 record_done); it stays byte-equal; deleting stays possible', async () => {
    const visit = await newVisit(body())
    const before = await db.query(`select * from public.pet_health_events where id = $1`, [visit.id])
    const itemsBefore = await db.query(`select id, name, instructions, deleted_at from public.pet_health_items where event_id = $1 order by position`, [visit.id])
    for (const patch of [
      { diagnosis: 'Гастрит' },
      { date: day(-3) },
      { date: day(3) },
      { clinic: 'Вет-центр' },
      { check_id: null },
      { prescriptions: [] },
      { status: 'done', notes: 'x' },
    ]) {
      const keyed = await patchVisit(request(tokenA, 'PATCH', patch, crypto.randomUUID()), eventParams(visit.id))
      const plain = await patchVisit(request(tokenA, 'PATCH', patch), eventParams(visit.id))
      expect([keyed.status, plain.status]).toEqual([409, 409])
      expect((await plain.json()).error.code).toBe('record_done')
    }
    expect((await db.query(`select * from public.pet_health_events where id = $1`, [visit.id])).rows).toEqual(before.rows)
    expect(
      (await db.query(`select id, name, instructions, deleted_at from public.pet_health_items where event_id = $1 order by position`, [visit.id])).rows,
    ).toEqual(itemsBefore.rows)
    // The page's lookup says «done»: the edit address shows the visit, never a form.
    expect(await findHealthRecord(createServiceClient(), owners.ownerAId, cat, visit.id)).toEqual({ kind: 'visit', status: 'done' })

    expect((await deleteEvent(request(tokenA, 'DELETE'), eventParams(visit.id))).status).toBe(204)
    // The course it started stays; only the link goes.
    expect(await courses()).toEqual([{ name: 'Фортифлора', visit_item_id: null, started_on: TODAY }])
  })
})

describe('criterion 4: a plan is marked held, cancelled or moved; the due dates follow', () => {
  it('moved: same id, new day, and /pets/due says the new day', async () => {
    const planned = await plan(day(7))
    const read = readPlanChange(planned, { ...draftFromPlan(planned), date: day(12), clinic: 'Айболит' }, TODAY)
    if (!read.ok || !read.value) throw new Error('the form refused the change')
    expect(read.value).toEqual({ date: day(12), clinic: 'Айболит' })
    const moved = await saved(await patchVisit(request(tokenA, 'PATCH', read.value, crypto.randomUUID()), eventParams(planned.id)))
    expect([moved.id, moved.date, moved.status, moved.clinic]).toEqual([planned.id, day(12), 'planned', 'Айболит'])
    expect((await due()).filter((d) => d.event_id === planned.id).map((d) => d.date)).toEqual([day(12)])
    // Not into the past.
    expect((await patchVisit(request(tokenA, 'PATCH', { date: day(-2) }), eventParams(planned.id))).status).toBe(400)
  })

  it('marked held: leaves the due dates, becomes a visit that happened; a plan in the future cannot be held ahead of its day', async () => {
    const planned = await plan(day(5))
    expect((await due()).some((d) => d.event_id === planned.id)).toBe(true)
    // «Состоялся» on a day still to come is refused.
    expect((await patchVisit(request(tokenA, 'PATCH', { status: 'done', date: day(2) }), eventParams(planned.id))).status).toBe(400)
    const read = readHeld(planned, heldDraft(planned, TODAY), TODAY)
    if (!read.ok) throw new Error('the form refused «Состоялся»')
    const held = await saved(await patchVisit(request(tokenA, 'PATCH', read.value, crypto.randomUUID()), eventParams(planned.id)))
    expect([held.id, held.status, held.date]).toEqual([planned.id, 'done', TODAY])
    expect((await due()).some((d) => d.event_id === planned.id)).toBe(false)
    expect(await findHealthRecord(createServiceClient(), owners.ownerAId, cat, planned.id)).toEqual({ kind: 'visit', status: 'done' })
  })

  it('cancelled: gone from the record and the due dates; the other plan stays', async () => {
    const first = await plan(day(5))
    const second = await plan(day(9))
    expect((await deleteEvent(request(tokenA, 'DELETE'), eventParams(first.id))).status).toBe(204)
    const ids = (await due()).map((d) => d.event_id)
    expect(ids).not.toContain(first.id)
    expect(ids).toContain(second.id)
    expect((await overview()).events.map((e) => e.id)).toEqual([second.id])
  })
})

describe('owner B', () => {
  it('reaches none of A’s visits: create, change, «Добавить в лекарства», delete, due', async () => {
    const planned = await plan()
    const read = readNewVisit(blankVisit(TODAY), TODAY)
    if (!read.ok) throw new Error('the form refused the visit')
    const heldVisit = await newVisit({ ...read.value, prescriptions: [{ name: 'Смекта' }] })

    expect((await createVisit(request(tokenB, 'POST', read.value, crypto.randomUUID()), params(cat))).status).toBe(404)
    expect((await patchVisit(request(tokenB, 'PATCH', { clinic: 'x' }), eventParams(planned.id))).status).toBe(404)
    expect((await patchVisit(request(tokenB, 'PATCH', { status: 'done', date: TODAY }), eventParams(planned.id))).status).toBe(404)
    expect((await toMedication(request(tokenB, 'POST'), itemParams(heldVisit.items[0].id))).status).toBe(404)
    expect((await deleteEvent(request(tokenB, 'DELETE'), eventParams(planned.id))).status).toBe(404)
    expect((await due(tokenB)).some((d) => d.event_id === planned.id)).toBe(false)
    expect(await findHealthRecord(createServiceClient(), owners.ownerBId, cat, planned.id)).toBeNull()

    // A's records are as they were.
    const mine = await overview()
    expect(mine.events.find((e) => e.id === planned.id)).toMatchObject({ status: 'planned', clinic: null })
    expect(await courses()).toEqual([])
  })
})
