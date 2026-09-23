import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { connect, resetFixtures, seedFixtures, type SeededFixtures } from './fixtures'
import { createDeletionWorkerDeps } from '@/server/account/deletion-worker'
import { PHOTO_BUCKET, grantUploads } from '@/server/uploads/photo-storage'

/** Stage 8/08 for the one bucket that holds user files: gone before the Auth user. */

let db: Client
let seeded: SeededFixtures

function service(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
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

describe('deleting an account with photos', () => {
  it('leaves no object of that person in the bucket, and keeps the other person’s', async () => {
    for (const owner of [seeded.ownerAId, seeded.ownerBId]) {
      const grant = await grantUploads(service() as never, owner, [{ content_type: 'image/jpeg', size_bytes: 4 }])
      const upload = grant!.uploads[0]
      const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: new Uint8Array(4) })
      expect(response.ok).toBe(true)
    }

    await createDeletionWorkerDeps(service() as never).deletePhotos(seeded.ownerAId)

    const { rows } = await db.query(`select name from storage.objects where bucket_id = $1`, [PHOTO_BUCKET])
    expect(rows).toHaveLength(1)
    expect(rows[0].name.startsWith(`${seeded.ownerBId}/`)).toBe(true)
    const { rows: uploads } = await db.query('select user_id from public.photo_uploads')
    expect(uploads).toEqual([{ user_id: seeded.ownerBId }])
  })

  it('is safe to run again when nothing is left', async () => {
    const deps = createDeletionWorkerDeps(service() as never)
    await deps.deletePhotos(seeded.ownerAId)
    await expect(deps.deletePhotos(seeded.ownerAId)).resolves.toBeUndefined()
  })
})
