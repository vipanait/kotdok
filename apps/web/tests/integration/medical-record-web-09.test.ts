import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import {
  HealthEventSchema,
  HealthOverviewSchema,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_REUSED,
  MedicationSchema,
  WeightMeasurementSchema,
  type HealthEvent,
  type Medication,
} from '@lapka/contracts'
import { endCoursePatch, newWeightInput, weightFieldText } from '@lapka/shared'
import { GET as getHealth } from '@/app/(backend)/api/v1/pets/[id]/health/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { PATCH as patchEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/[eventId]/route'
import { POST as completeItem } from '@/app/(backend)/api/v1/pets/[id]/health/items/[itemId]/complete/route'
import { POST as createVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/route'
import { PATCH as patchVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/[eventId]/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import { PATCH as patchMedication } from '@/app/(backend)/api/v1/pets/[id]/health/medications/[medicationId]/route'
import { POST as addWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/route'
import { PATCH as patchWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/[weightId]/route'
import { completeDraft, readCompletion } from '@/features/medical-record/events/complete-form'
import { weightPage } from '@/features/medical-record/weight/weight-view'
import { changeMedication } from '@/server/medical-record/medication-service'
import { deleteWeight } from '@/server/medical-record/weight-service'
import { createServiceClient } from '@/server/supabase/server'
import ru from '@/shared/i18n/dictionaries/ru'
import { FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// MW-09 Task 1: what only the database could close.
//
// - A change of a plan, a planned visit or a current course is refused inside
//   the SQL function that writes it, under the pet's lock: a «Сделано»,
//   «Состоялся» or «Завершить курс» that lands after the service's own check
//   and before the write is caught (the check-then-write window is held open
//   here on purpose, and also raced for real).
// - «Сделано» on a plan of one item keeps its own key: the same key with other
//   data is 409, with the same data the first answer.
// - «Сделано» tells an emptied clinic or note (cleared) from one not sent (kept).
// - A weight save takes an Idempotency-Key; a retry after midnight adds nothing.
// - «Уточнить» on the form's weight with no history leaves one dated row.
// - A course is finished by the owner's day when the app sends it.
// (The order of a repeated batch of courses: medical-record-web-05.test.ts.)

let db: Client
let tokenA: string
let owners: SeededFixtures
const pet: string = PET_IDS.aCat

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(method: string, body?: unknown, key?: string, query = '') {
  const headers: Record<string, string> = { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' }
  if (key) headers[IDEMPOTENCY_KEY_HEADER] = key
  return new NextRequest(`http://test.local/api/v1/x${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const eventParams = (eventId: string) => ({ params: Promise.resolve({ id: pet, eventId }) })
const itemParams = (itemId: string) => ({ params: Promise.resolve({ id: pet, itemId }) })
const medParams = (medicationId: string) => ({ params: Promise.resolve({ id: pet, medicationId }) })
const weightParams = (weightId: string) => ({ params: Promise.resolve({ id: pet, weightId }) })

// One reading of the clock for the whole file.
const NOW = Date.now()
function day(offset: number): string {
  return new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = day(0)

async function overview() {
  return HealthOverviewSchema.parse(await (await getHealth(request('GET'), params(pet))).json())
}

async function plan(body: { clinic?: string | null; notes?: string | null; items?: Array<{ name: string; targets: string[] }> } = {}): Promise<HealthEvent> {
  const response = await createEvent(
    request(
      'POST',
      {
        kind: 'parasite',
        status: 'planned',
        date: day(3),
        clinic: body.clinic ?? 'Айболит',
        notes: body.notes ?? 'Капать на холку',
        items: body.items ?? [{ name: 'Спот-он', targets: ['fleas'] }],
      },
      crypto.randomUUID(),
    ),
    params(pet),
  )
  expect(response.status).toBe(201)
  return HealthEventSchema.parse(await response.json())
}

async function storedEvent(id: string) {
  const { rows } = await db.query(`select status, event_date::text as date, clinic, notes from public.pet_health_events where id = $1`, [id])
  return rows[0] as { status: string; date: string; clinic: string | null; notes: string | null }
}

/**
 * Holds the pet's row lock from a second connection — the lock every write
 * of the pet's records takes first — while `send` goes through the route:
 * its service reads the record as it still is, passes its own check, and
 * waits inside the SQL function. Then `meanwhile` finishes the record in the
 * locking transaction, which commits; the waiting write goes on and must now
 * find the record finished. This is the read-then-write window, held open.
 */
async function inTheWindow(fn: string, send: () => Promise<Response>, meanwhile: (locker: Client) => Promise<void>): Promise<Response> {
  const locker = await connect()
  try {
    await locker.query('begin')
    await locker.query(`select id from public.pets where id = $1 for update`, [pet])
    const pending = send()
    // Wait until the route's write is blocked on that lock, inside `fn`.
    const deadline = Date.now() + 15_000
    for (;;) {
      const { rows } = await db.query(
        `select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and query ilike $1`,
        [`%${fn}%`],
      )
      if (rows[0].n > 0) break
      if (Date.now() > deadline) throw new Error(`${fn} never waited for the pet's lock`)
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    await meanwhile(locker)
    await locker.query('commit')
    return await pending
  } catch (error) {
    await locker.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await locker.end()
  }
}

beforeAll(async () => {
  db = await connect()
  owners = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
})

beforeEach(async () => {
  await db.query(`delete from public.pet_medications where pet_id = $1`, [pet])
  await db.query(`delete from public.pet_health_events where pet_id = $1`, [pet])
  await db.query(`delete from public.pet_weights where pet_id = any($1)`, [[pet, PET_IDS.aDog]])
  await db.query(`update public.pets set weight_kg = null, medications = '{}' where id = any($1)`, [[pet, PET_IDS.aDog]])
})

afterAll(async () => {
  await db?.end()
})

describe('a done record is refused inside the write, not only before it', () => {
  it('a plan corrected while «Сделано» lands in between: 409 record_done, the done record untouched', async () => {
    const planned = await plan()
    const response = await inTheWindow(
      'update_health_event',
      () => patchEvent(request('PATCH', { clinic: 'Другая', notes: 'Иначе' }), eventParams(planned.id)),
      async (locker) => {
        await locker.query(`select public.complete_health_item($1, $2, $3, $4, null, null, null, null)`, [
          owners.ownerAId, pet, planned.items[0].id, TODAY,
        ])
      },
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('record_done')
    expect(await storedEvent(planned.id)).toEqual({ status: 'done', date: TODAY, clinic: 'Айболит', notes: 'Капать на холку' })
  })

  it('an item of a plan of several that «Сделано» took out meanwhile: 409 record_done, the plan untouched', async () => {
    const planned = await plan({ items: [{ name: 'Спот-он', targets: ['fleas'] }, { name: 'Таблетка', targets: ['worms'] }] })
    const items = planned.items.map(({ id, name, targets }) => ({ id, name: `${name} (правка)`, targets }))
    const response = await inTheWindow(
      'update_health_event',
      () => patchEvent(request('PATCH', { items }), eventParams(planned.id)),
      async (locker) => {
        await locker.query(`select public.complete_health_item($1, $2, $3, $4, null, null, null, null)`, [
          owners.ownerAId, pet, planned.items[0].id, TODAY,
        ])
      },
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('record_done')
    const { rows } = await db.query(`select name from public.pet_health_items where pet_id = $1 and deleted_at is null order by name`, [pet])
    expect(rows.map((row: { name: string }) => row.name)).toEqual(['Спот-он', 'Таблетка'])
  })

  it('a planned visit changed while «Состоялся» lands in between: 409 record_done, the visit as it happened', async () => {
    const created = await createVisit(
      request('POST', { status: 'planned', date: day(2), visit_kind: 'checkup', clinic: 'Айболит', reason: 'Осмотр' }, crypto.randomUUID()),
      params(pet),
    )
    expect(created.status).toBe(201)
    const visit = HealthEventSchema.parse(await created.json())
    const response = await inTheWindow(
      'update_visit',
      () => patchVisit(request('PATCH', { reason: 'Прививка', clinic: 'Другая' }, crypto.randomUUID()), eventParams(visit.id)),
      async (locker) => {
        await locker.query(`select public.update_visit($1, $2, $3, $4::jsonb, null, $5, $6)`, [
          owners.ownerAId, pet, visit.id, JSON.stringify({ status: 'done', date: TODAY }), TODAY, crypto.randomUUID(),
        ])
      },
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('record_done')
    const { rows } = await db.query(`select status, clinic, reason from public.pet_health_events where id = $1`, [visit.id])
    expect(rows[0]).toEqual({ status: 'done', clinic: 'Айболит', reason: 'Осмотр' })
  })

  it('a course changed while «Завершить курс» lands in between: 409 record_done, the course as it ended', async () => {
    const saved = await addMedications(request('POST', { items: [{ name: 'Фортифлора', dosage: 'утром', started_on: day(-5) }] }, crypto.randomUUID()), params(pet))
    const [course] = MedicationSchema.array().parse(await saved.json())
    const response = await inTheWindow(
      'change_pet_medication',
      () => patchMedication(request('PATCH', { dosage: 'вечером' }, undefined, `?today=${TODAY}`), medParams(course.id)),
      async (locker) => {
        await locker.query(`select public.change_pet_medication($1, $2, $3, $4::jsonb, $5, $5)`, [
          owners.ownerAId, pet, course.id, JSON.stringify(endCoursePatch(TODAY)), TODAY,
        ])
      },
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('record_done')
    const { rows } = await db.query(`select dosage, ended_on::text as ended from public.pet_medications where id = $1`, [course.id])
    expect(rows[0]).toEqual({ dosage: 'утром', ended: TODAY })
  })

  it('«Сделано» and a correction of the same plan sent at once: whichever wins, the done record is never changed after', async () => {
    // Which order happens in a round is up to the database; each order must end consistently.
    for (let round = 0; round < 8; round += 1) {
      await db.query(`delete from public.pet_health_events where pet_id = $1`, [pet])
      const planned = await plan()
      const [done, patched] = await Promise.all([
        completeItem(request('POST', { done_on: TODAY }, crypto.randomUUID()), itemParams(planned.items[0].id)),
        patchEvent(request('PATCH', { clinic: 'Другая' }), eventParams(planned.id)),
      ])
      expect(done.status).toBe(200)
      expect([200, 409]).toContain(patched.status)
      const stored = await storedEvent(planned.id)
      expect(stored.status).toBe('done')
      if (patched.status === 409) {
        expect((await patched.json()).error.code).toBe('record_done')
        // Refused: the done record is what «Сделано» made of the plan.
        expect(stored.clinic).toBe('Айболит')
      } else {
        // The correction came first, while it was a plan; «Сделано» then kept its clinic.
        expect(stored.clinic).toBe('Другая')
      }
    }
  })

  it('an older server calling the functions as before still works (the deploy window)', async () => {
    const service = createServiceClient()
    const saved = await addMedications(request('POST', { items: [{ name: 'Старый вызов', started_on: day(-2) }] }, crypto.randomUUID()), params(pet))
    const [course] = MedicationSchema.array().parse(await saved.json())
    // change_pet_medication without p_over_by, record_pet_weight without p_key: as MW-08's server calls them.
    const changed = await service.rpc('change_pet_medication', {
      p_user_id: owners.ownerAId, p_pet_id: pet, p_medication_id: course.id, p_changes: { dosage: 'днём' }, p_today: TODAY,
    })
    expect(changed.error).toBeNull()
    const weighed = await service.rpc('record_pet_weight', {
      p_user_id: owners.ownerAId, p_pet_id: pet, p_measured_on: TODAY, p_weight_kg: 4.2, p_source: 'record',
    })
    expect(weighed.error).toBeNull()
    const weight = await service.rpc('change_pet_weight', {
      p_user_id: owners.ownerAId, p_pet_id: pet, p_weight_id: (weighed.data as { id: string }).id, p_measured_on: null, p_weight_kg: 4.3,
    })
    expect(weight.error).toBeNull()
  })

  it('the production server (origin/main) still edits done records by its old argument list; only this branch’s opts in', async () => {
    const service = createServiceClient()
    // What main's event-service and visit-service send: no p_refuse_done. Main has no
    // done-is-history rule and installed phones offer «Изменить» there — this must not become a 500.
    const doneEvent = HealthEventSchema.parse(
      await (
        await createEvent(
          request('POST', { kind: 'parasite', status: 'done', date: day(-1), clinic: 'Айболит', items: [{ name: 'Спот-он', targets: ['fleas'] }] }, crypto.randomUUID()),
          params(pet),
        )
      ).json(),
    )
    const mainEvent = await service.rpc('update_health_event', {
      p_user_id: owners.ownerAId, p_pet_id: pet, p_event_id: doneEvent.id, p_date: null, p_clinic: 'Правка с main', p_notes: null, p_items: null,
    })
    expect(mainEvent.error).toBeNull()
    expect((await storedEvent(doneEvent.id)).clinic).toBe('Правка с main')

    const doneVisit = HealthEventSchema.parse(
      await (await createVisit(request('POST', { status: 'done', date: day(-1), visit_kind: 'checkup', reason: 'Осмотр' }, crypto.randomUUID()), params(pet))).json(),
    )
    const mainVisit = await service.rpc('update_visit', {
      p_user_id: owners.ownerAId, p_pet_id: pet, p_event_id: doneVisit.id, p_changes: { reason: 'Правка с main' }, p_items: null, p_today: TODAY, p_key: crypto.randomUUID(),
    })
    expect(mainVisit.error).toBeNull()
    const { rows } = await db.query(`select reason from public.pet_health_events where id = $1`, [doneVisit.id])
    expect(rows[0].reason).toBe('Правка с main')

    // This branch's server passes p_refuse_done: the same calls are refused in SQL.
    const branchEvent = await service.rpc('update_health_event', {
      p_user_id: owners.ownerAId, p_pet_id: pet, p_event_id: doneEvent.id, p_date: null, p_clinic: 'Ещё', p_notes: null, p_items: null, p_refuse_done: true,
    })
    expect(branchEvent.error?.code).toBe('LP409')
    const branchVisit = await service.rpc('update_visit', {
      p_user_id: owners.ownerAId, p_pet_id: pet, p_event_id: doneVisit.id, p_changes: { reason: 'Ещё' }, p_items: null, p_today: TODAY, p_key: null, p_refuse_done: true,
    })
    expect(branchVisit.error?.code).toBe('LP409')
    // And through this branch's routes: 409 record_done, not 500.
    expect((await patchEvent(request('PATCH', { clinic: 'Ещё' }), eventParams(doneEvent.id))).status).toBe(409)
  })
})

describe('«Сделано» on a plan of one item keeps its own key', () => {
  it('the same key and data answer the same record; the same key with other data is 409, and nothing changes', async () => {
    const planned = await plan()
    const key = crypto.randomUUID()
    const body = { done_on: TODAY, clinic: 'Айболит', notes: 'Капали' }
    const first = await completeItem(request('POST', body, key), itemParams(planned.items[0].id))
    expect(first.status).toBe(200)
    const done = HealthEventSchema.parse(await first.json())
    expect(done.id).toBe(planned.id)

    const again = await completeItem(request('POST', body, key), itemParams(planned.items[0].id))
    expect(again.status).toBe(200)
    expect(HealthEventSchema.parse(await again.json())).toEqual(done)

    const other = await completeItem(request('POST', { ...body, notes: 'Совсем другое' }, key), itemParams(planned.items[0].id))
    expect(other.status).toBe(409)
    expect((await other.json()).error.code).toBe('conflict')
    expect(await storedEvent(planned.id)).toEqual({ status: 'done', date: TODAY, clinic: 'Айболит', notes: 'Капали' })

    // Another key on an item already done: the record as it was, as before (the apps compare it).
    const late = await completeItem(request('POST', { done_on: day(-1) }, crypto.randomUUID()), itemParams(planned.items[0].id))
    expect(late.status).toBe(200)
    expect(HealthEventSchema.parse(await late.json()).date).toBe(TODAY)
  })

  it('the key of the plan’s own create still finds it after «Сделано», and a create with the completion key is a conflict', async () => {
    const createKey = crypto.randomUUID()
    const body = { kind: 'parasite', status: 'planned', date: day(3), items: [{ name: 'Спот-он', targets: ['fleas'] }] }
    const created = HealthEventSchema.parse(await (await createEvent(request('POST', body, createKey), params(pet))).json())
    const completeKey = crypto.randomUUID()
    expect((await completeItem(request('POST', { done_on: TODAY }, completeKey), itemParams(created.items[0].id))).status).toBe(200)

    const lateCreate = await createEvent(request('POST', body, createKey), params(pet))
    expect(HealthEventSchema.parse(await lateCreate.json()).id).toBe(created.id)
    const misused = await createEvent(request('POST', body, completeKey), params(pet))
    expect(misused.status).toBe(409)
  })
})

describe('«Сделано» tells an emptied field from one not sent', () => {
  it('the web form sends an emptied clinic and note as empty, and the done record has neither', async () => {
    const planned = await plan()
    // What the owner sees: the plan's clinic and note, then both fields emptied.
    const draft = { ...completeDraft(planned, planned.items[0], TODAY), clinic: '', notes: '', next: day(90), nextTouched: true }
    const read = readCompletion(draft, TODAY)
    if (!read.ok) throw new Error('The form refused')
    expect(read.input).toMatchObject({ clinic: '', notes: '' })
    const response = await completeItem(request('POST', read.input, crypto.randomUUID()), itemParams(planned.items[0].id))
    expect(response.status).toBe(200)
    expect(await storedEvent(planned.id)).toEqual({ status: 'done', date: TODAY, clinic: null, notes: null })
    // The next plan follows the done record's clinic, not the old plan's.
    const { rows } = await db.query(`select clinic from public.pet_health_events where pet_id = $1 and status = 'planned' and deleted_at is null`, [pet])
    expect(rows).toEqual([{ clinic: null }])
  })

  it('left as the plan had them, they stay; null (what installed apps send for an empty field) keeps the plan’s', async () => {
    const kept = await plan()
    const read = readCompletion(completeDraft(kept, kept.items[0], TODAY), TODAY)
    if (!read.ok) throw new Error('The form refused')
    await completeItem(request('POST', read.input, crypto.randomUUID()), itemParams(kept.items[0].id))
    expect(await storedEvent(kept.id)).toMatchObject({ clinic: 'Айболит', notes: 'Капать на холку' })

    await db.query(`delete from public.pet_health_events where pet_id = $1`, [pet])
    const legacy = await plan()
    await completeItem(request('POST', { done_on: TODAY, clinic: null, notes: null }, crypto.randomUUID()), itemParams(legacy.items[0].id))
    expect(await storedEvent(legacy.id)).toMatchObject({ clinic: 'Айболит', notes: 'Капать на холку' })
  })

  it('on a plan of several, an emptied clinic leaves the new done record without one and the rest of the plan with its own', async () => {
    const planned = await plan({ items: [{ name: 'Спот-он', targets: ['fleas'] }, { name: 'Таблетка', targets: ['worms'] }] })
    const response = await completeItem(request('POST', { done_on: TODAY, clinic: '', notes: '' }, crypto.randomUUID()), itemParams(planned.items[0].id))
    const done = HealthEventSchema.parse(await response.json())
    expect(done.id).not.toBe(planned.id)
    expect([done.clinic, done.notes]).toEqual([null, null])
    expect(await storedEvent(planned.id)).toMatchObject({ status: 'planned', clinic: 'Айболит', notes: 'Капать на холку' })
  })
})

describe('a weight save with an Idempotency-Key', () => {
  it('a retry after midnight — the form’s day recomputed — adds no second measurement', async () => {
    const key = crypto.randomUUID()
    const first = await addWeight(request('POST', { measured_on: day(-1), weight_kg: 4.2 }, key), params(pet))
    expect(first.status).toBe(201)
    const saved = WeightMeasurementSchema.parse(await first.json())

    // The same save sent again: the measurement it made.
    const again = await addWeight(request('POST', { measured_on: day(-1), weight_kg: 4.2 }, key), params(pet))
    expect(again.status).toBe(201)
    expect(WeightMeasurementSchema.parse(await again.json())).toEqual(saved)

    // Sent again with the new day: the key was used for another weighing — nothing added.
    const nextDay = await addWeight(request('POST', { measured_on: TODAY, weight_kg: 4.2 }, key), params(pet))
    expect(nextDay.status).toBe(409)
    expect((await nextDay.json()).error).toMatchObject({ code: 'conflict', details: { reason: IDEMPOTENCY_KEY_REUSED } })
    expect((await overview()).weights).toHaveLength(1)

    // Without a key (an older app) the same retry would have been a second measurement.
    await addWeight(request('POST', { measured_on: TODAY, weight_kg: 4.2 }), params(pet))
    expect((await overview()).weights).toHaveLength(2)
  })

  it('a correction: the same key answers the same, another body is 409 with the reason; a taken day is 409 without it', async () => {
    const [a, b] = await Promise.all(
      [day(-3), day(-2)].map(async (measured_on) =>
        WeightMeasurementSchema.parse(await (await addWeight(request('POST', { measured_on, weight_kg: 4 }), params(pet))).json()),
      ),
    )
    const key = crypto.randomUUID()
    const first = await patchWeight(request('PATCH', { weight_kg: 4.3 }, key), weightParams(a.id))
    expect(first.status).toBe(200)
    const again = await patchWeight(request('PATCH', { weight_kg: 4.3 }, key), weightParams(a.id))
    expect(WeightMeasurementSchema.parse(await again.json())).toMatchObject({ id: a.id, weight_kg: 4.3 })
    const other = await patchWeight(request('PATCH', { weight_kg: 4.4 }, key), weightParams(a.id))
    expect(other.status).toBe(409)
    expect((await other.json()).error.details).toEqual({ reason: IDEMPOTENCY_KEY_REUSED })
    expect((await overview()).weights.find((w) => w.id === a.id)?.weight_kg).toBe(4.3)

    const taken = await patchWeight(request('PATCH', { measured_on: b.measured_on }, crypto.randomUUID()), weightParams(a.id))
    expect(taken.status).toBe(409)
    expect((await taken.json()).error.details).toBeUndefined()
  })

  it('the same key on another pet is a reused key, not a taken day — one after the other, or at the same moment', async () => {
    const dogWeights = async () =>
      (await db.query(`select count(*)::int as n from public.pet_weights where pet_id = $1 and deleted_at is null`, [PET_IDS.aDog])).rows[0].n
    const key = crypto.randomUUID()
    expect((await addWeight(request('POST', { measured_on: TODAY, weight_kg: 4.2 }, key), params(pet))).status).toBe(201)
    const after = await addWeight(request('POST', { measured_on: TODAY, weight_kg: 4.2 }, key), params(PET_IDS.aDog))
    expect(after.status).toBe(409)
    expect((await after.json()).error.details).toEqual({ reason: IDEMPOTENCY_KEY_REUSED })
    expect(await dogWeights()).toBe(0)

    // At the same moment: a save for the cat holds the key, not yet committed, under the cat's
    // lock; the dog's save holds the dog's lock, does not see the key, and meets it in
    // pet_weight_requests. Before MW-09's fix round that was the primary key's unique_violation — «the day is taken».
    const both = crypto.randomUUID()
    const locker = await connect()
    try {
      await locker.query('begin')
      await locker.query(`select public.record_pet_weight($1, $2, $3, 4.3, 'record', $4)`, [owners.ownerAId, pet, day(-1), both])
      const pending = addWeight(request('POST', { measured_on: TODAY, weight_kg: 30 }, both), params(PET_IDS.aDog))
      const deadline = Date.now() + 15_000
      for (;;) {
        const { rows } = await db.query(
          `select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%record_pet_weight%'`,
        )
        if (rows[0].n > 0) break
        if (Date.now() > deadline) throw new Error('the dog’s save never waited for the key')
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      await locker.query('commit')
      const response = await pending
      expect(response.status).toBe(409)
      expect((await response.json()).error).toMatchObject({ code: 'conflict', details: { reason: IDEMPOTENCY_KEY_REUSED } })
    } finally {
      await locker.query('rollback').catch(() => undefined)
      await locker.end()
    }
    // The dog's measurement went back with its refused request.
    expect(await dogWeights()).toBe(0)
  })

  it('deleting takes no key: a key refusal, were it ever to come back, is not reported as a conflict', async () => {
    const refusing = { rpc: async () => ({ data: null, error: { code: 'LPKEY', message: 'idempotency key reused with different data' } }) }
    const result = await deleteWeight(refusing as unknown as ReturnType<typeof createServiceClient>, owners.ownerAId, pet, crypto.randomUUID())
    expect(result).toMatchObject({ ok: false, reason: 'storage_error' })
  })

  it('refuses a key that is not one', async () => {
    const response = await addWeight(request('POST', { measured_on: TODAY, weight_kg: 4.2 }, 'short'), params(pet))
    expect(response.status).toBe(400)
  })
})

describe('«Уточнить» on the form’s weight with no history', () => {
  it('giving it a day leaves one dated row with that value, and the form keeps it', async () => {
    await db.query(`update public.pets set weight_kg = 4.2 where id = $1`, [pet])
    // The weight page offers «Уточнить» as a new weighing that starts from the form's value.
    const page = weightPage(ru, 'ru', await overview(), 'all', TODAY, true)
    expect(page.rows[0].action?.href).toBe(`/pets/${pet}/health/new?type=weight&from=form`)
    const read = newWeightInput(weightFieldText(4.2, ','), day(-30), TODAY)
    if (!read.ok) throw new Error('The form refused')
    const response = await addWeight(request('POST', read.input, crypto.randomUUID()), params(pet))
    expect(response.status).toBe(201)
    const record = await overview()
    expect(record.weights).toEqual([expect.objectContaining({ measured_on: day(-30), weight_kg: 4.2 })])
    expect(record.pet.weight_kg).toBe(4.2)
  })

  it('a first weighing with another value still keeps the form’s old one, undated', async () => {
    await db.query(`update public.pets set weight_kg = 4.2 where id = $1`, [pet])
    await addWeight(request('POST', { measured_on: TODAY, weight_kg: 4.5 }), params(pet))
    const record = await overview()
    expect(record.weights.map((w) => [w.measured_on, w.weight_kg])).toEqual([[TODAY, 4.5], [null, 4.2]])
    expect(record.pet.weight_kg).toBe(4.5)
  })
})

describe('a course is finished by the owner’s day when the app sends it', () => {
  async function course(fields: Partial<Medication>): Promise<Medication> {
    const saved = await addMedications(request('POST', { items: [{ name: 'Курс', started_on: day(-10), ...fields }] }, crypto.randomUUID()), params(pet))
    return MedicationSchema.array().parse(await saved.json())[0]
  }

  it('ending today on the owner’s day: refused at once, whatever the hour in UTC', async () => {
    const ended = await course({ ended_on: TODAY })
    const response = await patchMedication(request('PATCH', { dosage: 'вечером' }, undefined, `?today=${TODAY}`), medParams(ended.id))
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('record_done')
    // «Завершить курс» sent again changes nothing and is answered with the course.
    const repeat = await patchMedication(request('PATCH', endCoursePatch(TODAY), undefined, `?today=${TODAY}`), medParams(ended.id))
    expect(repeat.status).toBe(200)
  })

  it('an owner east of UTC, already on tomorrow: a course ending tomorrow is finished for them', async () => {
    const ended = await course({ ended_on: day(1) })
    const response = await patchMedication(request('PATCH', { dosage: 'вечером' }, undefined, `?today=${day(1)}`), medParams(ended.id))
    expect(response.status).toBe(409)
  })

  it('a day outside the window is not trusted: the server’s own window decides, as without one', async () => {
    const current = await course({ ended_on: day(3) })
    const response = await patchMedication(request('PATCH', { dosage: 'вечером' }, undefined, `?today=${day(5)}`), medParams(current.id))
    expect(response.status).toBe(200)
    expect(MedicationSchema.parse(await response.json()).dosage).toBe('вечером')
  })

  it('a day behind the server’s window («yesterday», or an owner west of UTC) does not reopen a course it counts finished', async () => {
    const ended = await course({ ended_on: TODAY })
    // 18:00 UTC: the window already counts a course ending today finished (today in UTC−12 too).
    const evening = new Date(`${TODAY}T18:00:00Z`)
    const service = createServiceClient()
    expect(await changeMedication(service, owners.ownerAId, pet, ended.id, { dosage: 'вечером' }, evening)).toEqual({ ok: false, reason: 'record_done' })
    // ?today=yesterday is inside clientToday's window, but only tightens: still refused.
    expect(await changeMedication(service, owners.ownerAId, pet, ended.id, { dosage: 'вечером' }, evening, day(-1))).toEqual({ ok: false, reason: 'record_done' })
    // The SQL guard gets the same day: called as the service would with that clock, it refuses too.
    const sql = await service.rpc('change_pet_medication', {
      p_user_id: owners.ownerAId, p_pet_id: pet, p_medication_id: ended.id, p_changes: { dosage: 'вечером' }, p_today: TODAY,
      p_over_by: TODAY,
    })
    expect(sql.error?.code).toBe('LP409')
  })

  it('without the owner’s day, the old window: ended today is still open early in the UTC day', async () => {
    const ended = await course({ ended_on: TODAY })
    const early = new Date(`${TODAY}T03:00:00Z`)
    const service = createServiceClient()
    expect(await changeMedication(service, owners.ownerAId, pet, ended.id, { dosage: 'днём' }, early)).toMatchObject({ ok: true })
    expect(await changeMedication(service, owners.ownerAId, pet, ended.id, { dosage: 'вечером' }, early, TODAY)).toEqual({ ok: false, reason: 'record_done' })
  })
})
