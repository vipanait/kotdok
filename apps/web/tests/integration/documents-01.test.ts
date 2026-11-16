import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import {
  DOCUMENT_LIMITS,
  DocumentGrantSchema,
  DocumentListSchema,
  PetDocumentSchema,
  type DocumentGrant,
} from '@lapka/contracts'
import { PET_IDS, connect, seedFixtures, type SeededFixtures } from './fixtures'
import { DOCUMENT_BUCKET, supabaseDocumentStorage } from '@/server/documents/document-storage'
import {
  completeDocument,
  createDocument,
  deleteDocument,
  listDocuments,
  patchDocument,
  readDocument,
  removePetDocuments,
  removeUserDocuments,
  sweepDocuments,
  type DocumentContext,
} from '@/server/documents/document-service'
import { softDeletePetAndChecks } from '@/server/pets/pet-service'

/** DOC-1 against real local Storage and database: the service the document routes stand on. */

let db: Client
let seeded: SeededFixtures

function service(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function context(userId: string): DocumentContext {
  const supabase = service() as never
  return { supabase, storage: supabaseDocumentStorage(supabase), userId }
}

/** Enough of a JPEG: SOI, an empty APP0, then a baseline SOF0 carrying the size. */
function jpeg(width = 100, height = 100): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
  ])
}

const IMAGE_FILE = { content_type: 'image/jpeg', size_bytes: 1000 } as const

async function create(owner: string, petId: string, files: { content_type: string; size_bytes: number }[] = [IMAGE_FILE]) {
  const result = await createDocument(context(owner), petId, { kind: 'vet_passport', files } as never)
  if (!result.ok) throw new Error(`create refused: ${result.reason}`)
  return DocumentGrantSchema.parse(result.value)
}

async function put(grant: DocumentGrant, bytes: Uint8Array | Uint8Array[]) {
  const all = Array.isArray(bytes) ? bytes : grant.uploads.map(() => bytes)
  for (const [i, upload] of grant.uploads.entries()) {
    const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: all[i] as BodyInit })
    expect(response.ok, await response.clone().text()).toBe(true)
  }
}

const objects = async () =>
  Number((await db.query(`select count(*) n from storage.objects where bucket_id = $1`, [DOCUMENT_BUCKET])).rows[0].n)
const rows = async (table: string) => Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n)

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
  await service().storage.emptyBucket(DOCUMENT_BUCKET)
})

afterAll(async () => {
  await db?.end()
})

describe('documents service', () => {
  it('creates and completes a 2 image document', async () => {
    const grant = await create(seeded.ownerAId, PET_IDS.aCat, [IMAGE_FILE, IMAGE_FILE])
    expect(grant.uploads).toHaveLength(2)
    expect(grant.uploads[0]!.headers['content-type']).toBe('image/jpeg')
    const expires = Date.parse(grant.uploads[0]!.expires_at) - Date.now()
    expect(expires).toBeGreaterThan((DOCUMENT_LIMITS.grantSeconds - 30) * 1000)
    expect(expires).toBeLessThanOrEqual(DOCUMENT_LIMITS.grantSeconds * 1000)

    const { rows: pending } = await db.query(`select status from public.pet_documents where id = $1`, [grant.document_id])
    expect(pending).toEqual([{ status: 'pending' }])

    await put(grant, jpeg())
    const done = await completeDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)
    expect(done.ok).toBe(true)
    if (!done.ok) return

    const document = PetDocumentSchema.parse(done.value)
    expect(document).toMatchObject({ kind: 'vet_passport', status: 'stored', page_count: 2, failure_code: null, draft: null })
    expect(document.files.map((f) => f.id)).toEqual(grant.uploads.map((u) => u.file_id))
    expect((await fetch(document.files[0]!.url)).status).toBe(200)

    const { rows: files } = await db.query(
      `select position, verified_at is not null as verified, page_count from public.pet_document_files where document_id = $1 order by position`,
      [grant.document_id],
    )
    expect(files).toEqual([
      { position: 0, verified: true, page_count: 1 },
      { position: 1, verified: true, page_count: 1 },
    ])

    // Again is the same answer, not an error: the phone may not have heard the first one.
    const again = await completeDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)
    expect(again.ok).toBe(true)
  })

  it('complete removes objects of a bad document', async () => {
    const grant = await create(seeded.ownerAId, PET_IDS.aCat, [IMAGE_FILE, IMAGE_FILE])
    await put(grant, [jpeg(), new Uint8Array([1, 2, 3, 4])])
    expect(await objects()).toBe(2)

    const done = await completeDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)
    expect(done).toEqual({ ok: false, reason: 'unsupported_media_type' })
    expect(await objects()).toBe(0)
    expect(await rows('pet_documents')).toBe(0)
    expect(await rows('pet_document_files')).toBe(0)
  })

  it('keeps a pending document when a file was not uploaded yet', async () => {
    const grant = await create(seeded.ownerAId, PET_IDS.aCat)
    const done = await completeDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)
    expect(done).toEqual({ ok: false, reason: 'storage_error' })
    expect(await rows('pet_documents')).toBe(1)
  })

  it('the 31st document is refused', async () => {
    for (let i = 0; i < DOCUMENT_LIMITS.perPet; i++) {
      await db.query(`insert into public.pet_documents (user_id, pet_id, kind, status) values ($1, $2, 'other', 'stored')`, [
        seeded.ownerAId,
        PET_IDS.aCat,
      ])
    }
    const refused = await createDocument(context(seeded.ownerAId), PET_IDS.aCat, { kind: 'other', files: [IMAGE_FILE] } as never)
    expect(refused).toEqual({ ok: false, reason: 'limit_reached' })
    // Another pet has its own thirty.
    const other = await createDocument(context(seeded.ownerAId), PET_IDS.aDog, { kind: 'other', files: [IMAGE_FILE] } as never)
    expect(other.ok).toBe(true)
  })

  it('lists stored documents with a signed link, reads one, and patches it', async () => {
    const grant = await create(seeded.ownerAId, PET_IDS.aCat)
    await create(seeded.ownerAId, PET_IDS.aCat) // still pending: not listed
    await put(grant, jpeg())
    await completeDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)

    const listed = await listDocuments(context(seeded.ownerAId), PET_IDS.aCat)
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const list = DocumentListSchema.parse(listed.value)
    expect(list.documents.map((d) => d.id)).toEqual([grant.document_id])
    expect(list.free_recognitions_left).toBe(3)
    expect(list.recognition_price).toBe(0)

    const patched = await patchDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id, {
      title: 'Паспорт Мурки',
      kind: 'prescription',
      document_date: '2026-11-01',
    })
    expect(patched.ok).toBe(true)
    const read = await readDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)
    expect(read.ok && PetDocumentSchema.parse(read.value)).toMatchObject({
      title: 'Паспорт Мурки',
      kind: 'prescription',
      document_date: '2026-11-01',
    })
  })

  it('refuses to patch a document that is still pending', async () => {
    const grant = await create(seeded.ownerAId, PET_IDS.aCat)
    expect(await patchDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id, { title: 'x' })).toEqual({
      ok: false,
      reason: 'wrong_status',
    })
  })

  it('delete removes objects and rows', async () => {
    const grant = await create(seeded.ownerAId, PET_IDS.aCat, [IMAGE_FILE, IMAGE_FILE])
    await put(grant, jpeg())
    await completeDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)
    expect(await objects()).toBe(2)

    expect((await deleteDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)).ok).toBe(true)
    expect(await objects()).toBe(0)
    expect(await rows('pet_documents')).toBe(0)
    expect(await rows('pet_document_files')).toBe(0)
    expect(await deleteDocument(context(seeded.ownerAId), PET_IDS.aCat, grant.document_id)).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it("another owner's document is not found on every service function", async () => {
    const grant = await create(seeded.ownerAId, PET_IDS.aCat)
    await put(grant, jpeg())
    const b = context(seeded.ownerBId)
    const notFound = { ok: false, reason: 'not_found' }

    // B asks about A's pet, and about A's document under B's own pet.
    for (const petId of [PET_IDS.aCat, PET_IDS.bCat]) {
      expect(await completeDocument(b, petId, grant.document_id)).toEqual(notFound)
      expect(await readDocument(b, petId, grant.document_id)).toEqual(notFound)
      expect(await patchDocument(b, petId, grant.document_id, { title: 'x' })).toEqual(notFound)
      expect(await deleteDocument(b, petId, grant.document_id)).toEqual(notFound)
    }
    expect(await createDocument(b, PET_IDS.aCat, { kind: 'other', files: [IMAGE_FILE] } as never)).toEqual(notFound)
    expect(await listDocuments(b, PET_IDS.aCat)).toEqual(notFound)
    // A deleted pet has no documents either.
    expect(await listDocuments(b, PET_IDS.bDeleted)).toEqual(notFound)

    expect(await rows('pet_documents')).toBe(1)
    expect(await objects()).toBe(1)
  })

  it('sweep removes pending older than 3h with its objects', async () => {
    const old = await create(seeded.ownerAId, PET_IDS.aCat)
    await put(old, jpeg())
    const kept = await create(seeded.ownerAId, PET_IDS.aDog)
    await put(kept, jpeg())
    await completeDocument(context(seeded.ownerAId), PET_IDS.aDog, kept.document_id)
    const fresh = await create(seeded.ownerAId, PET_IDS.aDog)
    await put(fresh, jpeg())

    const deps = { supabase: service() as never, storage: supabaseDocumentStorage(service() as never) }
    const soon = new Date(Date.now() + 60 * 60 * 1000)
    expect(await sweepDocuments(deps, soon)).toBe(0)
    expect(await objects()).toBe(3)

    // 4 hours on: both pending documents are old, the stored one stays.
    const later = new Date(Date.now() + 4 * 60 * 60 * 1000)
    expect(await sweepDocuments(deps, later)).toBe(2)
    const { rows: left } = await db.query(`select id, status from public.pet_documents`)
    expect(left).toEqual([{ id: kept.document_id, status: 'stored' }])
    expect(await objects()).toBe(1)
  })

  it('sweep removes objects no document points at', async () => {
    const grant = await create(seeded.ownerAId, PET_IDS.aCat)
    await put(grant, jpeg())
    await db.query(`delete from public.pet_documents where id = $1`, [grant.document_id])

    const deps = { supabase: service() as never, storage: supabaseDocumentStorage(service() as never) }
    expect(await sweepDocuments(deps, new Date(Date.now() + 4 * 60 * 60 * 1000))).toBe(1)
    expect(await objects()).toBe(0)
  })

  it('pet deletion removes its documents', async () => {
    const mine = await create(seeded.ownerAId, PET_IDS.aCat)
    await put(mine, jpeg())
    await completeDocument(context(seeded.ownerAId), PET_IDS.aCat, mine.document_id)
    const other = await create(seeded.ownerAId, PET_IDS.aDog)
    await put(other, jpeg())
    await completeDocument(context(seeded.ownerAId), PET_IDS.aDog, other.document_id)

    const deleted = await softDeletePetAndChecks(service() as never, seeded.ownerAId, PET_IDS.aCat)
    expect(deleted.ok).toBe(true)

    const { rows: left } = await db.query(`select id from public.pet_documents`)
    expect(left).toEqual([{ id: other.document_id }])
    expect(await objects()).toBe(1)
  })

  it('removePetDocuments and removeUserDocuments leave other people alone', async () => {
    for (const [owner, pet] of [
      [seeded.ownerAId, PET_IDS.aCat],
      [seeded.ownerAId, PET_IDS.aDog],
      [seeded.ownerBId, PET_IDS.bCat],
    ] as const) {
      const grant = await create(owner, pet)
      await put(grant, jpeg())
    }
    expect((await removePetDocuments(context(seeded.ownerAId), PET_IDS.aCat)).ok).toBe(true)
    expect(await objects()).toBe(2)

    expect((await removeUserDocuments(context(seeded.ownerAId))).ok).toBe(true)
    const { rows: left } = await db.query(`select name from storage.objects where bucket_id = $1`, [DOCUMENT_BUCKET])
    expect(left).toHaveLength(1)
    expect(left[0].name.startsWith(`${seeded.ownerBId}/`)).toBe(true)
    // Rows go with the account's data step, not here.
    expect(await rows('pet_documents')).toBe(2)
  })
})
