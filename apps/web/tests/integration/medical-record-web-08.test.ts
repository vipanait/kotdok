import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { HealthEventSchema, IDEMPOTENCY_KEY_HEADER, PetSchema } from '@lapka/contracts'
import { petFormHints } from '@lapka/shared'
import { POST as createPet } from '@/app/(backend)/api/v1/pets/route'
import { DELETE as deletePet } from '@/app/(backend)/api/v1/pets/[id]/route'
import { POST as createEvent } from '@/app/(backend)/api/v1/pets/[id]/health/events/route'
import { POST as createVisit } from '@/app/(backend)/api/v1/pets/[id]/health/visits/route'
import { POST as addMedications } from '@/app/(backend)/api/v1/pets/[id]/health/medications/route'
import { POST as addWeight } from '@/app/(backend)/api/v1/pets/[id]/health/weights/route'
import { loadPetsOverview } from '@/server/dashboard/load-dashboard'
import { getHealthOverview } from '@/server/medical-record/overview-service'
import { updatePet } from '@/server/pets/pet-service'
import { createServiceClient } from '@/server/supabase/server'
import { petDueLine } from '@/features/medical-record/view-model'
import ru from '@/shared/i18n/dictionaries/ru'
import { FIXTURE_PASSWORD, OWNER_A, PET_IDS, connect, seedFixtures } from './fixtures'

// MW-08: the overview's due lines and the pet form against the real database.
// Every pet's line comes from one read of the owner's plans; owner B sees
// none of A's. The web form saves the way the phone's does: an untouched
// weight is not a new measurement, a course added elsewhere since the form
// was opened is not ended, and the medicines' day is the owner's today.

let db: Client
let tokenA: string
let ownerAId: string
let ownerBId: string
const created: string[] = []

async function signIn(email: string): Promise<string> {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) throw error
  return data.session!.access_token
}

function request(token: string, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
  }
  return new NextRequest('http://test.local/x', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

// One reading of the clock for the whole file: TODAY and every day(n) are
// counted from it, so a run across midnight UTC cannot mix two todays.
const NOW = Date.now()
function day(offset: number): string {
  return new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = day(0)

async function ok(response: Response) {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response
}

async function newPet(body: Record<string, unknown>): Promise<string> {
  const response = await ok(await createPet(request(tokenA, 'POST', body), undefined))
  const pet = PetSchema.parse(await response.json())
  created.push(pet.id)
  return pet.id
}

async function plan(petId: string, date: string, targets: string[], kind: 'vaccination' | 'parasite' = 'vaccination') {
  const response = await ok(
    await createEvent(request(tokenA, 'POST', { kind, status: 'planned', date, items: [{ name: null, targets }] }), params(petId)),
  )
  return HealthEventSchema.parse(await response.json())
}

beforeAll(async () => {
  db = await connect()
  ;({ ownerAId, ownerBId } = await seedFixtures(db))
  tokenA = await signIn(OWNER_A.email)
})

afterAll(async () => {
  for (const id of created) await deletePet(request(tokenA, 'DELETE'), params(id))
  await db?.end()
})

describe('the overview’s due lines (MW-08.1)', () => {
  it('names each pet’s one nearest date from one list of plans, and none past fourteen days', async () => {
    const overdue = await newPet({ species: 'cat', name: 'Просрочка' })
    const soon = await newPet({ species: 'cat', name: 'Скоро' })
    const later = await newPet({ species: 'dog', name: 'Нескоро' })
    const visit = await newPet({ species: 'dog', name: 'Визит' })
    const none = await newPet({ species: 'cat', name: 'Без сроков' })

    // A plan in the past cannot be made through the API: made for next week, then moved back, as time would.
    const late = await plan(overdue, day(7), ['fleas', 'ticks'], 'parasite')
    await db.query('update public.pet_health_events set event_date = $2 where id = $1', [late.id, day(-12)])
    await plan(overdue, day(3), ['rabies'])
    await plan(soon, day(10), ['panleukopenia'])
    await plan(soon, day(5), ['rabies'])
    await plan(later, day(40), ['rabies'])
    await ok(await createVisit(request(tokenA, 'POST', { status: 'planned', date: day(1), visit_kind: 'checkup', reason: 'Контроль' }), params(visit)))

    const { pets, dueByPet } = await loadPetsOverview(ownerAId, TODAY)
    // Five pets of the test and the two fixture pets, in the list's order.
    expect(pets.map((pet) => pet.id)).toEqual(expect.arrayContaining([overdue, soon, later, visit, none, PET_IDS.aCat, PET_IDS.aDog]))

    const line = (petId: string) => (dueByPet[petId] ? petDueLine(ru, 'ru', dueByPet[petId], TODAY) : null)
    expect(line(overdue)).toEqual({ tone: 'overdue', text: 'Блохи и клещи — просрочено' })
    expect(line(soon)).toEqual({ tone: 'soon', text: 'Бешенство — через 5 дней' })
    expect(line(visit)).toEqual({ tone: 'soon', text: 'Визит к врачу — завтра' })
    expect(dueByPet[later]).toBeUndefined()
    expect(dueByPet[none]).toBeUndefined()
    // Each line belongs to its own pet: the row it is drawn in links to that pet.
    for (const [petId, due] of Object.entries(dueByPet)) expect(due.pet_id).toBe(petId)
  })

  it('shows owner B none of A’s pets or dates', async () => {
    const { pets, dueByPet } = await loadPetsOverview(ownerBId, TODAY)
    expect(pets.map((pet) => pet.id)).toEqual([PET_IDS.bCat])
    const aPets = new Set(created)
    expect(Object.keys(dueByPet).filter((petId) => aPets.has(petId))).toEqual([])
  })
})

describe('the web pet form and the record (MW-08, spec §4)', () => {
  const service = () => createServiceClient()
  const todays = async (petId: string) =>
    Number(
      (await db.query<{ kg: string }>('select weight_kg as kg from public.pet_weights where pet_id = $1 and measured_on = $2 and deleted_at is null', [petId, TODAY]))
        .rows[0]?.kg,
    )

  /** The pet as the web form sends it back unchanged, plus what the form adds. */
  async function formBody(petId: string, extra: Record<string, unknown>) {
    const { data } = await service().from('pets').select('*').eq('id', petId).single()
    const fields = { ...(data as Record<string, unknown>) }
    for (const key of ['id', 'user_id', 'created_at']) delete fields[key]
    return { ...fields, ...extra }
  }

  it('does not write the weight it was opened with over a newer one', async () => {
    const pet = await newPet({ species: 'cat', name: 'Весы' })
    await ok(await addWeight(request(tokenA, 'POST', { measured_on: day(-5), weight_kg: 4.2 }), params(pet)))
    const opened = await formBody(pet, {})
    // While the form is open, today's weighing comes in from the phone.
    await ok(await addWeight(request(tokenA, 'POST', { measured_on: TODAY, weight_kg: 4.5 }), params(pet)))

    // As the web form now saves: the weight as opened goes back with it, and is not a measurement.
    const saved = await updatePet(service(), ownerAId, pet, { ...opened, name: 'Весы', weight_kg_before: 4.2, weight_measured_on: TODAY })
    expect(saved.ok).toBe(true)
    expect(await todays(pet)).toBe(4.5)

    // What the form did before MW-08: without it, the stale 4.2 replaced today's 4.5.
    await updatePet(service(), ownerAId, pet, { ...opened, weight_measured_on: TODAY })
    expect(await todays(pet)).toBe(4.2)
  })

  it('keeps a course added elsewhere while the form was open', async () => {
    const pet = await newPet({ species: 'cat', name: 'Курсы', medications: ['Лечебный корм'] })
    const opened = ['Лечебный корм']
    // Meanwhile, on the phone or in the record: a new course.
    await ok(await addMedications(request(tokenA, 'POST', { items: [{ name: 'Фортифлора', started_on: TODAY }] }), params(pet)))

    // The form adds «Витамины» to the list it opened with.
    await updatePet(service(), ownerAId, pet, await formBody(pet, { medications: ['Лечебный корм', 'Витамины'], medications_before: opened, weight_measured_on: TODAY }))
    const overview = await getHealthOverview(service(), ownerAId, pet)
    if (!overview.ok) throw new Error(overview.reason)
    expect(overview.data.pet.medications.sort()).toEqual(['Витамины', 'Лечебный корм', 'Фортифлора'])
  })

  it('starts a medicine the form adds on the owner’s today, never on an old weighing day', async () => {
    const pet = await newPet({ species: 'dog', name: 'День' })
    await updatePet(service(), ownerAId, pet, await formBody(pet, { medications: ['Витамины'], medications_before: [], weight_kg: 12, weight_measured_on: day(-10) }))
    const overview = await getHealthOverview(service(), ownerAId, pet)
    if (!overview.ok) throw new Error(overview.reason)
    // The weighing keeps its day; the course is not back-dated to it.
    expect(overview.data.weights.map((weight) => weight.measured_on)).toEqual([day(-10)])
    expect(overview.data.medications.map((course) => course.started_on)).toEqual([TODAY])
  })

  it('points the form to the record only where the record says more', async () => {
    // The fixture dog: the form only.
    const bare = await getHealthOverview(service(), ownerAId, PET_IDS.aDog)
    if (!bare.ok) throw new Error(bare.reason)
    expect(petFormHints(bare.data)).toEqual({ weight: false, vaccinations: 0, medications: false })

    const pet = await newPet({ species: 'cat', name: 'Подсказки', medications: ['Лечебный корм'] })
    await ok(await addWeight(request(tokenA, 'POST', { measured_on: day(-3), weight_kg: 4 }), params(pet)))
    await ok(
      await createEvent(
        request(tokenA, 'POST', { kind: 'vaccination', status: 'done', date: day(-30), items: [{ name: 'Нобивак Rabies', targets: ['rabies'] }] }),
        params(pet),
      ),
    )
    const full = await getHealthOverview(service(), ownerAId, pet)
    if (!full.ok) throw new Error(full.reason)
    // The form's medicine is a name only: no «Дозировка и даты — в медкарте» yet.
    expect(petFormHints(full.data)).toEqual({ weight: true, vaccinations: 1, medications: false })
  })
})
