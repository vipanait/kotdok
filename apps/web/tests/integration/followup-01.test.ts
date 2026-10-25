import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import {
  CheckFollowupSchema,
  FollowupCaseListSchema,
  FollowupCaseSchema,
  FollowupCheckinResultSchema,
  SymptomCheckRecordSchema,
  type Urgency,
} from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { recordFollowupCheckin, setCheckFollowup, expireFollowups } from '@/server/followup/followup-service'
import { GET as getCheckFollowup, PUT as putCheckFollowup } from '@/app/(backend)/api/v1/checks/[id]/followup/route'
import { GET as listFollowups } from '@/app/(backend)/api/v1/followups/route'
import { GET as getCase } from '@/app/(backend)/api/v1/followups/[caseId]/route'
import { POST as postCheckin } from '@/app/(backend)/api/v1/followups/[caseId]/checkins/route'
import { POST as dismiss } from '@/app/(backend)/api/v1/followups/[caseId]/dismiss/route'
import { POST as snooze } from '@/app/(backend)/api/v1/followups/[caseId]/snooze/route'
import { DELETE as unrecord, PUT as record } from '@/app/(backend)/api/v1/followups/[caseId]/record/route'
import { GET as getCheck } from '@/app/(backend)/api/v1/checks/[id]/route'
import { GET as listChecks } from '@/app/(backend)/api/v1/checks/route'
import { GET as cron } from '@/app/(backend)/api/cron/followup-expiry/route'
import { OWNER_A, OWNER_B, PET_IDS, connect, seedFixtures, signIn, bearerRequest, type SeededFixtures } from './fixtures'

/** FU-01: the follow-up case, its rule and its API, on the real local database. */

let db: Client
let seeded: SeededFixtures
let tokenA: string
let tokenB: string
const HOUR = 3_600_000

function request(token: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}, url = 'http://test.local/x') {
  return bearerRequest(url, { method, body, headers }, token)
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })
const caseParams = (caseId: string) => ({ params: Promise.resolve({ caseId }) })

/** A check made `hoursAgo` before now, as the analysis stores it. */
async function check(urgency: Urgency, hoursAgo = 1, petId: string | null = PET_IDS.aCat, userId = seeded.ownerAId): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.symptom_checks
       (user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes, home_care_steps, vet_questions, full_response, created_at)
     values ($1, $2, 'рвота дважды\nвялая', $3, 'reason', '{}', '{}', '{}', '{}'::jsonb, now() - make_interval(secs => $4))
     returning id`,
    [userId, petId, urgency, hoursAgo * 3600],
  )
  return rows[0]!.id
}

async function enable(token: string, checkId: string, enabled = true) {
  return putCheckFollowup(request(token, 'PUT', { enabled, via: 'mobile' }), idParams(checkId))
}

async function caseOf(checkId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`select id from public.followup_cases where origin_check_id = $1`, [checkId])
  return rows[0]!.id
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  tokenA = await signIn(OWNER_A.email)
  tokenB = await signIn(OWNER_B.email)
})

afterAll(async () => {
  await db?.end()
})

describe('the offer on a result (FU-01.2)', () => {
  it('offers monitor on by default, with its questions at 12 and 48 hours from the check', async () => {
    const id = await check('monitor', 1)
    const response = await getCheckFollowup(request(tokenA), idParams(id))
    expect(response.status).toBe(200)
    const body = CheckFollowupSchema.parse(await response.json())
    expect(body.case).toBeNull()
    expect(body.offer).toMatchObject({ plan: 'watch', default_enabled: true, replaces: null })
    // A zone-less column: read it as text, it is UTC.
    const { rows } = await db.query<{ created_at: string }>(`select created_at::text from public.symptom_checks where id = $1`, [id])
    const made = new Date(`${rows[0]!.created_at.replace(' ', 'T')}Z`).getTime()
    expect(body.offer!.due_at.map((at) => (new Date(at).getTime() - made) / HOUR)).toEqual([12, 48])
  })

  it('offers urgent switched off', async () => {
    const body = CheckFollowupSchema.parse(await (await getCheckFollowup(request(tokenA), idParams(await check('urgent')))).json())
    expect(body.offer).toMatchObject({ plan: 'vet', default_enabled: false })
  })

  it('offers nothing for healthy, without a pet or after twelve hours, and refuses to switch those on', async () => {
    for (const id of [await check('healthy'), await check('monitor', 1, null), await check('monitor', 13)]) {
      const body = CheckFollowupSchema.parse(await (await getCheckFollowup(request(tokenA), idParams(id))).json())
      expect(body.offer).toBeNull()
      expect((await enable(tokenA, id)).status).toBe(409)
    }
  })

  it('creates one case however often and however concurrently it is switched on', async () => {
    const id = await check('monitor')
    const responses = await Promise.all([enable(tokenA, id), enable(tokenA, id), enable(tokenA, id)])
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200])
    const { rows } = await db.query(`select status from public.followup_cases where origin_check_id = $1`, [id])
    expect(rows).toEqual([{ status: 'active' }])
  })

  it('keeps an offered-and-declined case as off, and lists only open ones', async () => {
    const id = await check('urgent')
    const off = CheckFollowupSchema.parse(await (await enable(tokenA, id, false)).json())
    expect(off.case?.status).toBe('off')
    const list = FollowupCaseListSchema.parse(await (await listFollowups(request(tokenA), {} as never)).json())
    expect(list.items).toEqual([])
  })

  it('closes the pet’s open case as superseded when a new check is followed', async () => {
    const first = await check('monitor', 5)
    await enable(tokenA, first)
    const second = await check('home_care', 1)
    const offer = CheckFollowupSchema.parse(await (await getCheckFollowup(request(tokenA), idParams(second))).json())
    expect(offer.offer?.replaces?.case_id).toBe(await caseOf(first))

    await enable(tokenA, second)
    const { rows } = await db.query(`select status, outcome from public.followup_cases where origin_check_id = $1`, [first])
    expect(rows).toEqual([{ status: 'closed', outcome: 'superseded' }])
    const list = FollowupCaseListSchema.parse(await (await listFollowups(request(tokenA), {} as never)).json())
    expect(list.items.map((item) => item.origin_check_id)).toEqual([second])
  })
})

describe('switching off and on again', () => {
  it('resumes the question the case was waiting for, escalation included', async () => {
    const id = await check('monitor', 1)
    await enable(tokenA, id)
    const caseId = await caseOf(id)
    await postCheckin(request(tokenA, 'POST', { state: 'worse', source: 'timeline' }, { 'Idempotency-Key': 'key-00000010' }), caseParams(caseId))

    const off = CheckFollowupSchema.parse(await (await enable(tokenA, id, false)).json())
    expect(off.case).toMatchObject({ status: 'off' })
    expect(FollowupCaseListSchema.parse(await (await listFollowups(request(tokenA), {} as never)).json()).items).toEqual([])

    const on = CheckFollowupSchema.parse(await (await enable(tokenA, id)).json())
    expect(on.case).toMatchObject({ status: 'active', next_slot: 'vet', escalation: 'see_vet_today', checkin_count: 1 })
  })
})

describe('answers (FU-01.3)', () => {
  it('stores an answer once per Idempotency-Key and reports what the rule decided', async () => {
    const id = await check('monitor', 1)
    await enable(tokenA, id)
    const caseId = await caseOf(id)
    const send = () =>
      postCheckin(request(tokenA, 'POST', { state: 'worse', note: 'хуже', source: 'notification' }, { 'Idempotency-Key': 'key-00000001' }), caseParams(caseId))

    const first = await send()
    const second = await send()
    expect([first.status, second.status]).toEqual([201, 200])
    const result = FollowupCheckinResultSchema.parse(await first.json())
    expect(result.checkin).toMatchObject({ slot: 'extra', state: 'worse', decision: 'see_vet_today', note: 'хуже' })
    expect(result.case).toMatchObject({ status: 'active', escalation: 'see_vet_today', next_slot: 'vet', checkin_count: 1 })
    expect(FollowupCheckinResultSchema.parse(await second.json()).checkin.id).toBe(result.checkin.id)
    const { rows } = await db.query(`select count(*)::int n from public.followup_checkins where case_id = $1`, [caseId])
    expect(rows[0]).toEqual({ n: 1 })
  })

  it('requires the vet answer when the case asks about the vet, and refuses it otherwise', async () => {
    const urgent = await check('urgent')
    await enable(tokenA, urgent)
    const urgentCase = await caseOf(urgent)
    const missing = await postCheckin(request(tokenA, 'POST', { state: 'same', source: 'timeline' }, { 'Idempotency-Key': 'key-00000002' }), caseParams(urgentCase))
    expect(missing.status).toBe(400)

    const monitor = await check('monitor', 1, PET_IDS.aDog)
    await enable(tokenA, monitor)
    const extra = await postCheckin(
      request(tokenA, 'POST', { state: 'same', vet_visited: true, source: 'timeline' }, { 'Idempotency-Key': 'key-00000003' }),
      caseParams(await caseOf(monitor)),
    )
    expect(extra.status).toBe(400)
  })

  it('closes on «yes, we saw a vet» and refuses a later answer', async () => {
    const id = await check('urgent')
    await enable(tokenA, id)
    const caseId = await caseOf(id)
    const yes = await postCheckin(
      request(tokenA, 'POST', { state: 'better', vet_visited: true, source: 'pet_card' }, { 'Idempotency-Key': 'key-00000004' }),
      caseParams(caseId),
    )
    expect(FollowupCheckinResultSchema.parse(await yes.json()).case).toMatchObject({ status: 'closed', outcome: 'vet_seen', next_due_at: null })
    const late = await postCheckin(request(tokenA, 'POST', { state: 'same', vet_visited: false, source: 'pet_card' }, { 'Idempotency-Key': 'key-00000005' }), caseParams(caseId))
    expect(late.status).toBe(409)
  })

  it('counts a «same» given after 48 hours as the final answer and sends to a vet', async () => {
    const supabase = createServiceClient()
    const id = await check('monitor', 50)
    const { rows } = await db.query<{ created_at: string }>(`select created_at::text from public.symptom_checks where id = $1`, [id])
    const made = new Date(`${rows[0]!.created_at.replace(' ', 'T')}Z`)
    const switched = await setCheckFollowup(supabase, seeded.ownerAId, id, { enabled: true, via: 'web' }, new Date(made.getTime() + HOUR))
    expect(switched.ok).toBe(true)
    const result = await recordFollowupCheckin(supabase, seeded.ownerAId, await caseOf(id), { state: 'same', source: 'web_banner' }, 'key-00000006')
    expect(result.ok && result.data.checkin).toMatchObject({ slot: 'final', decision: 'see_vet' })
    expect(result.ok && result.data.case).toMatchObject({ escalation: 'see_vet', next_slot: 'vet' })
  })
})

describe('isolation (FU-01.4)', () => {
  it('answers 404 to another user on every route of a case, and lists nothing of theirs', async () => {
    const id = await check('monitor')
    await enable(tokenA, id)
    const caseId = await caseOf(id)

    expect((await getCheckFollowup(request(tokenB), idParams(id))).status).toBe(404)
    expect((await enable(tokenB, id)).status).toBe(404)
    expect((await getCase(request(tokenB), caseParams(caseId))).status).toBe(404)
    expect((await postCheckin(request(tokenB, 'POST', { state: 'better', source: 'timeline' }, { 'Idempotency-Key': 'key-00000007' }), caseParams(caseId))).status).toBe(404)
    expect((await dismiss(request(tokenB, 'POST'), caseParams(caseId))).status).toBe(404)
    expect((await snooze(request(tokenB, 'POST', { until: new Date(Date.now() + HOUR).toISOString() }), caseParams(caseId))).status).toBe(404)
    expect((await record(request(tokenB, 'PUT'), caseParams(caseId))).status).toBe(404)
    expect(FollowupCaseListSchema.parse(await (await listFollowups(request(tokenB), {} as never)).json()).items).toEqual([])
  })

  it('keeps the tables out of reach of a user token', async () => {
    const id = await check('monitor')
    await enable(tokenA, id)
    const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { authorization: `Bearer ${tokenA}` } },
    })
    for (const table of ['followup_cases', 'followup_checkins', 'followup_case_checks']) {
      const { data, error } = await client.from(table).select('*')
      expect(error !== null || (data ?? []).length === 0).toBe(true)
    }
  })
})

describe('the case’s other actions', () => {
  it('reads the timeline, hides until tomorrow, dismisses, and keeps a closed case in the record', async () => {
    const id = await check('monitor')
    await enable(tokenA, id)
    const caseId = await caseOf(id)

    const timeline = FollowupCaseSchema.parse(await (await getCase(request(tokenA), caseParams(caseId))).json())
    expect(timeline.checks).toMatchObject([{ check_id: id, kind: 'origin', urgency: 'monitor', symptoms: 'рвота дважды' }])
    expect(timeline).toMatchObject({ pet_name: 'Мурка', pet_species: 'cat', symptoms: 'рвота дважды', checkins: [], visits: [] })

    const until = new Date(Date.now() + 20 * HOUR).toISOString()
    const hidden = await (await snooze(request(tokenA, 'POST', { until }), caseParams(caseId))).json()
    expect(hidden.hidden_until).toBe(until)
    expect((await snooze(request(tokenA, 'POST', { until: new Date(Date.now() + 72 * HOUR).toISOString() }), caseParams(caseId))).status).toBe(400)

    expect((await record(request(tokenA, 'PUT'), caseParams(caseId))).status).toBe(409)
    const dismissed = await (await dismiss(request(tokenA, 'POST'), caseParams(caseId))).json()
    expect(dismissed).toMatchObject({ status: 'closed', outcome: 'dismissed' })

    const saved = await (await record(request(tokenA, 'PUT'), caseParams(caseId))).json()
    const again = await (await record(request(tokenA, 'PUT'), caseParams(caseId))).json()
    expect(saved.saved_to_record_at).not.toBeNull()
    expect(again.saved_to_record_at).toBe(saved.saved_to_record_at)
    expect((await (await unrecord(request(tokenA, 'DELETE'), caseParams(caseId))).json()).saved_to_record_at).toBeNull()
  })
})

describe('deletion (FU-01.5)', () => {
  it('lets an account with an open case, answers and a visit linked to its check be deleted completely', async () => {
    const id = await check('urgent')
    await enable(tokenA, id)
    const caseId = await caseOf(id)
    await postCheckin(request(tokenA, 'POST', { state: 'same', vet_visited: false, source: 'timeline' }, { 'Idempotency-Key': 'key-00000008' }), caseParams(caseId))
    await db.query(
      `insert into public.pet_health_events (user_id, pet_id, kind, status, event_date, check_id)
       values ($1, $2, 'visit', 'done', current_date, $3)`,
      [seeded.ownerAId, PET_IDS.aCat, id],
    )

    await db.query(`select public.request_account_deletion($1, $2)`, [seeded.ownerAId, `receipt-${seeded.ownerAId}`])
    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])

    for (const table of ['followup_cases', 'followup_checkins', 'followup_case_checks']) {
      const { rows } = await db.query(`select count(*)::int n from public.${table} where user_id = $1`, [seeded.ownerAId])
      expect(rows[0]).toEqual({ n: 0 })
    }
  })

  it('closes the open case of a pet deleted softly', async () => {
    const id = await check('monitor')
    await enable(tokenA, id)
    await db.query(`update public.pets set deleted_at = now() where id = $1`, [PET_IDS.aCat])
    const { rows } = await db.query(`select status, outcome from public.followup_cases where origin_check_id = $1`, [id])
    expect(rows).toEqual([{ status: 'closed', outcome: 'pet_deleted' }])
  })
})

describe('the case on a check (FU-01.6)', () => {
  it('reaches only a client that names followup in X-Lapka-Features', async () => {
    const id = await check('monitor')
    await enable(tokenA, id)

    const plain = await (await getCheck(request(tokenA), idParams(id))).json()
    expect('followup' in plain).toBe(false)
    const featured = await (await getCheck(request(tokenA, 'GET', undefined, { 'X-Lapka-Features': 'pet-dates,followup' }), idParams(id))).json()
    expect(SymptomCheckRecordSchema.parse(featured).followup).toMatchObject({ case_id: await caseOf(id), kind: 'origin', status: 'active' })

    const plainList = await (await listChecks(request(tokenA), {} as never)).json()
    expect(plainList.items.every((item: object) => !('followup' in item))).toBe(true)
    const list = await (await listChecks(request(tokenA, 'GET', undefined, { 'X-Lapka-Features': 'followup' }), {} as never)).json()
    expect(list.items.find((item: { id: string }) => item.id === id).followup.kind).toBe('origin')
  })
})

describe('expiry (FU-01.7)', () => {
  it('closes a case nobody answered a week after its question, and the route wants the secret', async () => {
    const id = await check('monitor')
    await enable(tokenA, id)
    await db.query(`update public.followup_cases set next_due_at = now() - interval '8 days' where origin_check_id = $1`, [id])
    expect(await expireFollowups(createServiceClient())).toBe(1)
    const { rows } = await db.query(`select outcome from public.followup_cases where origin_check_id = $1`, [id])
    expect(rows).toEqual([{ outcome: 'expired' }])

    expect((await cron(new NextRequest('http://test.local/api/cron/followup-expiry'))).status).toBe(401)
  })
})

describe('statistics function (FU-04)', () => {
  it('aggregates without a row cap', async () => {
    const id = await check('home_care')
    await enable(tokenA, id)
    await postCheckin(request(tokenA, 'POST', { state: 'worse', source: 'notification' }, { 'Idempotency-Key': 'key-00000009' }), caseParams(await caseOf(id)))
    const declined = await check('urgent', 1, PET_IDS.bCat, seeded.ownerBId)
    await enable(tokenB, declined, false)

    const { rows } = await db.query<{ s: { by_urgency: Record<string, unknown>[]; first_source: Record<string, number> } }>(
      `select public.admin_followup_statistics(now() - interval '1 day', now() + interval '1 hour') s`,
    )
    const byUrgency = Object.fromEntries(rows[0]!.s.by_urgency.map((row) => [row.urgency, row]))
    expect(byUrgency.home_care).toMatchObject({ offered: 1, enabled: 1, answered: 1, first_worse: 1, any_worse: 1, escalated: 1 })
    expect(byUrgency.urgent).toMatchObject({ offered: 1, enabled: 0, answered: 0 })
    expect(rows[0]!.s.first_source).toEqual({ notification: 1 })
  })
})
