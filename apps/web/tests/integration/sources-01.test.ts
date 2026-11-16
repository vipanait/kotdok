import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Client } from 'pg'
import { SymptomCheckRecordSchema } from '@lapka/contracts'
import { checkSources } from '@lapka/shared'
import { createServiceClient } from '@/server/supabase/server'
import { getCheck } from '@/server/checks/check-history-service'
import { NO_VET_CONTEXT, type VetKnowledgeMatch } from '@/server/symptom-check/vet-sources'
import { PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'

// SRC-01: a check keeps the materials its analysis relied on. The real
// database, with the model faked and the knowledge search answered by the
// test: the local corpus is empty.

const model = vi.hoisted(() => ({
  requests: [] as { messages: { role: string; content: unknown }[] }[],
  answer: {} as Record<string, unknown>,
}))

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0) }] }) }
    chat = {
      completions: {
        create: async (request: { messages: { role: string; content: unknown }[] }) => {
          model.requests.push(request)
          return { choices: [{ message: { content: JSON.stringify(model.answer) } }] }
        },
      },
    }
  },
}))

const ANSWER = {
  urgency: 'monitor',
  urgency_reason: 'stable',
  possible_causes: ['diet'],
  species_specific_warning: null,
  home_care_steps: ['water'],
  vet_questions: [],
}

const VCA_URL = 'https://vcahospitals.com/know-your-pet/vomiting-in-cats'
const MERCK_URL = 'https://www.merckvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats'

const FOUND: VetKnowledgeMatch[] = [
  { content: 'vca first', source_title: 'Vomiting in Cats', source_url: VCA_URL, source_name: 'vca', similarity: 0.62 },
  { content: 'merck', source_title: 'Disorders of the Stomach in Cats', source_url: MERCK_URL, source_name: 'merck', similarity: 0.55 },
  { content: 'vca second', source_title: 'Vomiting in Cats', source_url: VCA_URL, source_name: 'vca', similarity: 0.5 },
]

type Search = { data: VetKnowledgeMatch[] | null; error: { message: string } | null }

let db: Client
let seeded: SeededFixtures

/** The service client, with the knowledge search answered here. */
function clientWithSearch(search: Search) {
  const client = createServiceClient()
  const rpc = client.rpc.bind(client)
  client.rpc = ((name: string, args?: unknown) =>
    name === 'search_vet_knowledge' ? Promise.resolve(search) : rpc(name as never, args as never)) as typeof client.rpc
  return client
}

async function analyse(search: Search, answer: Record<string, unknown>) {
  const { analyzeSymptomCheck } = await import('@/server/symptom-check/analyze-symptom-check')
  model.requests.length = 0
  model.answer = answer
  const outcome = await analyzeSymptomCheck(clientWithSearch(search), {
    userId: seeded.ownerAId,
    symptoms: 'vomiting twice today',
    petId: PET_IDS.aCat,
    photos: [],
    appetite: null,
    activity: null,
    duration: null,
    stool: null,
    pain_signs: [],
  })
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  const checkId = (outcome as { checkId: string }).checkId
  const system = String(model.requests[0].messages.find((message) => message.role === 'system')!.content)
  const { rows } = await db.query(`select full_response from public.symptom_checks where id = $1`, [checkId])
  return { checkId, system, stored: rows[0].full_response as Record<string, unknown> }
}

async function credits(): Promise<number> {
  const { rows } = await db.query(`select credits from public.profiles where id = $1`, [seeded.ownerAId])
  return rows[0].credits
}

beforeAll(async () => {
  db = await connect()
  seeded = await seedFixtures(db)
  await db.query(`update public.profiles set credits = 20 where id = $1`, [seeded.ownerAId])
  await db.query(`delete from public.api_rate_limits where bucket like $1`, [`%${seeded.ownerAId}%`])
})

afterAll(async () => {
  await db?.end()
})

describe('the sources of a symptom check (SRC-01)', () => {
  it('keeps the materials the model marked, in its order, and nothing it made up (SRC-01/01–03)', async () => {
    const { system, stored } = await analyse({ data: FOUND, error: null }, { ...ANSWER, used_sources: [2, 1, 9] })

    // Two fragments of one article are one material: [1] twice, [2] once.
    expect(system.match(/\[1\] Vomiting in Cats/g)).toHaveLength(2)
    expect(system).toContain('[2] Disorders of the Stomach in Cats')
    expect(system).not.toContain('[3]')

    expect(stored.sources).toEqual([
      { title: 'Disorders of the Stomach in Cats', publisher: 'Merck Veterinary Manual', url: MERCK_URL, lang: 'en' },
      { title: 'Vomiting in Cats', publisher: 'VCA Animal Hospitals', url: VCA_URL, lang: 'en' },
    ])
    expect(stored).not.toHaveProperty('used_sources')
  })

  it('keeps the numbers of the context out of the text a reader sees', async () => {
    const { stored } = await analyse(
      { data: FOUND, error: null },
      { ...ANSWER, urgency_reason: 'Likely hairballs [1].', home_care_steps: ['Water [1][2]'], used_sources: [1] },
    )

    expect(stored.urgency_reason).toBe('Likely hairballs.')
    expect(stored.home_care_steps).toEqual(['Water'])
  })

  it('saves the check without sources when the model names none (SRC-01/05)', async () => {
    const before = await credits()
    const { stored } = await analyse({ data: FOUND, error: null }, ANSWER)

    expect(stored.sources).toEqual([])
    expect(await credits()).toBe(before - 1)
  })

  it('goes on without context when the search fails (SRC-01/05)', async () => {
    const { system, stored } = await analyse(
      { data: null, error: { message: 'search failed' } },
      { ...ANSWER, used_sources: [1] },
    )

    expect(system).toContain(NO_VET_CONTEXT)
    expect(stored.sources).toEqual([])
  })

  it('says there is no context when everything found is under the threshold', async () => {
    const weak = FOUND.map((row) => ({ ...row, similarity: 0.1 }))
    const { system, stored } = await analyse({ data: weak, error: null }, { ...ANSWER, used_sources: [1] })

    expect(system).toContain(NO_VET_CONTEXT)
    expect(stored.sources).toEqual([])
  })

  it('is still a check an installed build can read (SRC-01/10)', async () => {
    const { checkId } = await analyse({ data: FOUND, error: null }, { ...ANSWER, used_sources: [1] })

    // What `GET /api/v1/checks/{id}` hands to a client that sends no features.
    const result = await getCheck(createServiceClient(), seeded.ownerAId, checkId)
    expect(result.ok, JSON.stringify(result)).toBe(true)

    const record = SymptomCheckRecordSchema.parse((result as { data: unknown }).data)
    expect(checkSources(record.full_response).map((source) => source.url)).toEqual([VCA_URL])
  })
})
