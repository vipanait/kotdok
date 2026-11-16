import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import {
  ApiErrorEnvelopeSchema,
  DocumentGrantSchema,
  DocumentListSchema,
  FEATURE_PET_DOCUMENTS,
  FEATURES_HEADER,
  HealthOverviewSchema,
  PetDocumentSchema,
  type DocumentGrant,
} from '@lapka/contracts'
import { OWNER_A, PET_IDS, bearerRequest, connect, seedFixtures, signIn, type SeededFixtures } from './fixtures'
import { DOCUMENT_BUCKET } from '@/server/documents/document-storage'
import { GET as listRoute, POST as createRoute } from '@/app/(backend)/api/v1/pets/[id]/documents/route'
import { DELETE as deleteRoute, GET as readRoute, PATCH as patchRoute } from '@/app/(backend)/api/v1/pets/[id]/documents/[docId]/route'
import { POST as completeRoute } from '@/app/(backend)/api/v1/pets/[id]/documents/[docId]/complete/route'
import { GET as healthRoute } from '@/app/(backend)/api/v1/pets/[id]/health/route'

/** DOC-1: the document routes, called as a phone would. */

let db: Client
let seeded: SeededFixtures
let token: string

const IMAGE = { content_type: 'image/jpeg', size_bytes: 1000 }

/** Enough of a JPEG: SOI, an empty APP0, then a baseline SOF0 carrying the size. */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0x64,
  0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
])

const pet = (petId: string) => ({ params: Promise.resolve({ id: petId }) })
const doc = (petId: string, docId: string) => ({ params: Promise.resolve({ id: petId, docId }) })

const base = (petId: string) => `/api/v1/pets/${petId}/documents`

function create(body: unknown, petId: string = PET_IDS.aCat) {
  return createRoute(bearerRequest(base(petId), { method: 'POST', body }, token), pet(petId))
}

async function grant(petId: string = PET_IDS.aCat, files: unknown[] = [IMAGE]): Promise<DocumentGrant> {
  const response = await create({ kind: 'vet_passport', files }, petId)
  expect(response.status, await response.clone().text()).toBe(201)
  return DocumentGrantSchema.parse(await response.json())
}

async function put(granted: DocumentGrant, bytes: Uint8Array) {
  for (const upload of granted.uploads) {
    const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes as BodyInit })
    expect(response.ok, await response.clone().text()).toBe(true)
  }
}

function complete(docId: string, petId: string = PET_IDS.aCat) {
  return completeRoute(bearerRequest(`${base(petId)}/${docId}/complete`, { method: 'POST' }, token), doc(petId, docId))
}

async function stored(petId: string = PET_IDS.aCat): Promise<string> {
  const granted = await grant(petId)
  await put(granted, JPEG)
  expect((await complete(granted.document_id, petId)).status).toBe(200)
  return granted.document_id
}

async function errorOf(response: Response) {
  return ApiErrorEnvelopeSchema.parse(await response.json()).error
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  await db.query('truncate table public.api_rate_limits')
  await createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
    .storage.emptyBucket(DOCUMENT_BUCKET)
  token = await signIn(OWNER_A.email)
})

afterAll(async () => {
  await db?.end()
})

describe('documents API', () => {
  it('POST grants PUT urls', async () => {
    const response = await create({ kind: 'vet_passport', title: 'Паспорт', files: [IMAGE, IMAGE] })
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const granted = DocumentGrantSchema.parse(await response.json())
    expect(granted.uploads).toHaveLength(2)
    expect(granted.uploads.every((upload) => upload.method === 'PUT')).toBe(true)
  })

  it('refuses a body that does not match, a stranger’s pet and a missing session', async () => {
    expect((await create({ kind: 'vet_passport', files: [] })).status).toBe(400)
    expect((await create({ kind: 'vet_passport', files: [IMAGE] }, PET_IDS.bCat)).status).toBe(404)
    expect((await create({ kind: 'vet_passport', files: [IMAGE] }, 'not-a-uuid')).status).toBe(404)
    const anonymous = await createRoute(
      new Request(`http://test.local${base(PET_IDS.aCat)}`, { method: 'POST', body: '{}' }) as never,
      pet(PET_IDS.aCat),
    )
    expect(anonymous.status).toBe(401)
  })

  it('PUT then complete stores the document', async () => {
    const granted = await grant()
    await put(granted, JPEG)
    const response = await complete(granted.document_id)
    expect(response.status).toBe(200)
    const document = PetDocumentSchema.parse(await response.json())
    expect(document).toMatchObject({ id: granted.document_id, status: 'stored', page_count: 1 })
    expect((await fetch(document.files[0]!.url)).status).toBe(200)
  })

  it('complete answers 400 bad_request with the reason for a bad file, and the document is gone', async () => {
    const granted = await grant()
    await put(granted, new Uint8Array([1, 2, 3, 4]))
    const response = await complete(granted.document_id)
    expect(response.status).toBe(400)
    const error = await errorOf(response)
    expect(error.code).toBe('bad_request')
    expect(error.details).toEqual({ reason: 'unsupported_media_type' })
    const { rows } = await db.query('select count(*)::int as n from public.pet_documents')
    expect(rows[0].n).toBe(0)
  })

  it('complete before the upload is 503 and can be repeated; a stranger gets 404', async () => {
    const granted = await grant()
    const early = await complete(granted.document_id)
    expect(early.status).toBe(503)
    expect((await errorOf(early)).code).toBe('dependency_unavailable')
    await put(granted, JPEG)
    expect((await complete(granted.document_id)).status).toBe(200)

    const other = await completeRoute(
      bearerRequest(`${base(PET_IDS.aDog)}/${granted.document_id}/complete`, { method: 'POST' }, token),
      doc(PET_IDS.aDog, granted.document_id),
    )
    expect(other.status).toBe(404)
  })

  it('GET lists with free_recognitions_left 3', async () => {
    const id = await stored()
    await grant() // pending: not listed
    const response = await listRoute(bearerRequest(base(PET_IDS.aCat), {}, token), pet(PET_IDS.aCat))
    expect(response.status).toBe(200)
    const list = DocumentListSchema.parse(await response.json())
    expect(list.documents.map((d) => d.id)).toEqual([id])
    expect(list.free_recognitions_left).toBe(3)
  })

  it('GET reads one, and 404s a document under another pet', async () => {
    const id = await stored()
    const response = await readRoute(bearerRequest(`${base(PET_IDS.aCat)}/${id}`, {}, token), doc(PET_IDS.aCat, id))
    expect(PetDocumentSchema.parse(await response.json()).id).toBe(id)
    const other = await readRoute(bearerRequest(`${base(PET_IDS.aDog)}/${id}`, {}, token), doc(PET_IDS.aDog, id))
    expect(other.status).toBe(404)
  })

  it('PATCH renames', async () => {
    const id = await stored()
    const response = await patchRoute(
      bearerRequest(`${base(PET_IDS.aCat)}/${id}`, { method: 'PATCH', body: { title: 'Рецепт', document_date: '2026-11-01' } }, token),
      doc(PET_IDS.aCat, id),
    )
    expect(response.status).toBe(200)
    expect(PetDocumentSchema.parse(await response.json())).toMatchObject({ title: 'Рецепт', document_date: '2026-11-01' })
    const empty = await patchRoute(bearerRequest(`${base(PET_IDS.aCat)}/${id}`, { method: 'PATCH', body: {} }, token), doc(PET_IDS.aCat, id))
    expect(empty.status).toBe(400)
  })

  it('PATCH of a pending document is 409', async () => {
    const granted = await grant()
    const response = await patchRoute(
      bearerRequest(`${base(PET_IDS.aCat)}/${granted.document_id}`, { method: 'PATCH', body: { title: 'x' } }, token),
      doc(PET_IDS.aCat, granted.document_id),
    )
    expect(response.status).toBe(409)
    expect((await errorOf(response)).details).toEqual({ reason: 'wrong_status' })
  })

  it('DELETE removes', async () => {
    const id = await stored()
    const response = await deleteRoute(bearerRequest(`${base(PET_IDS.aCat)}/${id}`, { method: 'DELETE' }, token), doc(PET_IDS.aCat, id))
    expect(response.status).toBe(204)
    const { rows } = await db.query('select count(*)::int as n from public.pet_documents')
    expect(rows[0].n).toBe(0)
    const again = await deleteRoute(bearerRequest(`${base(PET_IDS.aCat)}/${id}`, { method: 'DELETE' }, token), doc(PET_IDS.aCat, id))
    expect(again.status).toBe(404)
  })

  it('the 31st document is 409 conflict', async () => {
    for (let i = 0; i < 30; i++) {
      await db.query(`insert into public.pet_documents (user_id, pet_id, kind, status) values ($1, $2, 'other', 'stored')`, [
        seeded.ownerAId,
        PET_IDS.aCat,
      ])
    }
    const response = await create({ kind: 'other', files: [IMAGE] })
    expect(response.status).toBe(409)
    expect((await errorOf(response)).details).toEqual({ reason: 'limit_reached' })
  })

  it('rate limit document_create 21st is 429', async () => {
    for (let i = 0; i < 20; i++) expect((await create({ kind: 'other', files: [IMAGE] }, PET_IDS.aDog)).status).toBe(201)
    const response = await create({ kind: 'other', files: [IMAGE] }, PET_IDS.aDog)
    expect(response.status).toBe(429)
    expect((await errorOf(response)).code).toBe('rate_limited')
  })

  it('refuses every route for an account that is being deleted', async () => {
    const id = await stored()
    await db.query(`update public.profiles set status = 'deleting' where id = $1`, [seeded.ownerAId])
    const responses = [
      await create({ kind: 'other', files: [IMAGE] }),
      await listRoute(bearerRequest(base(PET_IDS.aCat), {}, token), pet(PET_IDS.aCat)),
      await readRoute(bearerRequest(`${base(PET_IDS.aCat)}/${id}`, {}, token), doc(PET_IDS.aCat, id)),
      await patchRoute(bearerRequest(`${base(PET_IDS.aCat)}/${id}`, { method: 'PATCH', body: { title: 'x' } }, token), doc(PET_IDS.aCat, id)),
      await deleteRoute(bearerRequest(`${base(PET_IDS.aCat)}/${id}`, { method: 'DELETE' }, token), doc(PET_IDS.aCat, id)),
      await complete(id),
    ]
    for (const response of responses) {
      expect(response.status).toBe(403)
      expect((await errorOf(response)).code).toBe('account_deleting')
    }
    const { rows } = await db.query('select count(*)::int as n from public.pet_documents')
    expect(rows[0].n).toBe(1)
  })

  it('overview writable has documents only with the feature header', async () => {
    const read = async (headers: Record<string, string>) => {
      const response = await healthRoute(bearerRequest(`/api/v1/pets/${PET_IDS.aCat}/health`, { headers }, token), pet(PET_IDS.aCat))
      return HealthOverviewSchema.parse(await response.json()).writable
    }
    expect(await read({})).not.toContain('documents')
    expect(await read({ [FEATURES_HEADER]: 'pet-avatar' })).not.toContain('documents')
    expect(await read({ [FEATURES_HEADER]: `pet-avatar, ${FEATURE_PET_DOCUMENTS}` })).toContain('documents')
  })
})
