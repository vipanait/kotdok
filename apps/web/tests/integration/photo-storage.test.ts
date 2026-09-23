import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'
import {
  PHOTO_BUCKET,
  grantUploads,
  removeUploads,
  removeUserPhotos,
  sweepExpiredUploads,
} from '@/server/uploads/photo-storage'

/**
 * Stage 6/01 against real local Storage: what a signed upload lets the phone
 * do, and what it does not.
 */

let db: Client
let seeded: SeededFixtures

function service(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// A real JPEG is not needed here: Storage checks the declared type against
// the bucket, and the bytes are verified later by photo-verify.
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

async function put(grant: { url: string; headers: Record<string, string> }, body = BYTES) {
  return fetch(grant.url, { method: 'PUT', headers: grant.headers, body })
}

async function objectCount(): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from storage.objects where bucket_id = $1`,
    [PHOTO_BUCKET],
  )
  return rows[0].n
}

async function oneUpload(owner: string) {
  const grant = await grantUploads(service() as never, owner, [{ content_type: 'image/jpeg', size_bytes: 4 }])
  return grant!.uploads[0]
}

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  await resetFixtures(db)
  seeded = await seedFixtures(db)
  await service().storage.emptyBucket(PHOTO_BUCKET)
  await db.query('truncate table public.photo_uploads')
})

afterAll(async () => {
  await db?.end()
})

describe('grantUploads', () => {
  it('hands out one PUT per file, valid for fifteen minutes, and records each', async () => {
    const now = new Date()
    const grant = await grantUploads(
      service() as never,
      seeded.ownerAId,
      [
        { content_type: 'image/jpeg', size_bytes: 4 },
        { content_type: 'image/png', size_bytes: 4 },
      ],
      now,
    )

    expect(grant?.uploads).toHaveLength(2)
    expect(grant!.uploads[0]).toMatchObject({
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' },
    })
    expect(new Date(grant!.uploads[0].expires_at).getTime() - now.getTime()).toBe(15 * 60 * 1000)

    const { rows } = await db.query('select user_id, object_path from public.photo_uploads')
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.object_path.startsWith(`${seeded.ownerAId}/`)).toBe(true)
  })

  it('lets the phone write the file with nothing but the grant', async () => {
    const response = await put(await oneUpload(seeded.ownerAId))
    expect(response.ok).toBe(true)
    expect(await objectCount()).toBe(1)
  })

  it('does not let the same grant overwrite the object once written', async () => {
    const upload = await oneUpload(seeded.ownerAId)
    await put(upload)
    const second = await put(upload, new Uint8Array([1, 2, 3, 4]))
    expect(second.ok).toBe(false)
  })

  it('refuses a type the bucket does not allow, whatever the grant said', async () => {
    const upload = await oneUpload(seeded.ownerAId)
    const response = await put({ ...upload, headers: { ...upload.headers, 'content-type': 'text/html' } })
    expect(response.ok).toBe(false)
    expect(await objectCount()).toBe(0)
  })

  it('does not let anyone read the photo back without the service key', async () => {
    await put(await oneUpload(seeded.ownerAId))
    const { rows } = await db.query('select object_path from public.photo_uploads')

    const anon = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.storage.from(PHOTO_BUCKET).download(rows[0].object_path)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})

describe('removing photos', () => {
  it('removes the objects and the rows of the uploads it is given', async () => {
    await put(await oneUpload(seeded.ownerAId))
    const { rows } = await db.query('select id, object_path from public.photo_uploads')

    await removeUploads(service() as never, rows)

    expect(await objectCount()).toBe(0)
    const { rows: left } = await db.query('select count(*)::int as n from public.photo_uploads')
    expect(left[0].n).toBe(0)
  })

  it('removes everything one person uploaded, and nothing of anyone else’s', async () => {
    for (const owner of [seeded.ownerAId, seeded.ownerAId, seeded.ownerBId]) {
      await put(await oneUpload(owner))
    }

    await removeUserPhotos(service() as never, seeded.ownerAId)

    expect(await objectCount()).toBe(1)
    const { rows } = await db.query('select user_id from public.photo_uploads')
    expect(rows).toEqual([{ user_id: seeded.ownerBId }])
  })

  it('sweeps only uploads older than three hours', async () => {
    await put(await oneUpload(seeded.ownerAId))
    await put(await oneUpload(seeded.ownerAId))
    // Age one upload: its row and its object both.
    const { rows } = await db.query(
      `update public.photo_uploads set created_at = now() - interval '3 hours 1 minute'
        where id = (select id from public.photo_uploads order by created_at limit 1)
        returning object_path`,
    )
    await db.query(
      `update storage.objects set created_at = now() - interval '3 hours 1 minute'
        where bucket_id = $1 and name = $2`,
      [PHOTO_BUCKET, rows[0].object_path],
    )

    expect(await sweepExpiredUploads(service() as never)).toBe(1)
    expect(await objectCount()).toBe(1)
    const { rows: left } = await db.query('select count(*)::int as n from public.photo_uploads')
    expect(left[0].n).toBe(1)
  })

  it('sweeps an object written again after its upload was removed', async () => {
    // A signed upload URL lives two hours and is not single-use: once its
    // object is gone it can create it again. No row points at that object.
    const upload = await oneUpload(seeded.ownerAId)
    await put(upload)
    const { rows } = await db.query('select id, object_path from public.photo_uploads')
    await removeUploads(service() as never, rows)
    expect((await put(upload)).ok).toBe(true)
    expect(await objectCount()).toBe(1)

    const later = new Date(Date.now() + (3 * 60 + 1) * 60 * 1000)
    expect(await sweepExpiredUploads(service() as never, later)).toBe(1)
    expect(await objectCount()).toBe(0)
  })

  it('keeps going past one batch until nothing old is left', async () => {
    for (let i = 0; i < 3; i++) await put(await oneUpload(seeded.ownerAId))

    const later = new Date(Date.now() + (3 * 60 + 1) * 60 * 1000)
    expect(await sweepExpiredUploads(service() as never, later, 2)).toBe(3)
    expect(await objectCount()).toBe(0)
    const { rows } = await db.query('select count(*)::int as n from public.photo_uploads')
    expect(rows[0].n).toBe(0)
  })
})
