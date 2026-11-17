import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { OWNER_A, PET_IDS, connect, requestDeletion, seedFixtures, signIn, type SeededFixtures } from './fixtures'

/** DOC-1, the database half: who may touch the tables, and what account deletion leaves. */

let db: Client
let seeded: SeededFixtures

beforeAll(async () => {
  db = await connect()
})

beforeEach(async () => {
  seeded = await seedFixtures(db)
})

afterAll(async () => {
  await db?.end()
})

async function document(userId: string, petId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.pet_documents (user_id, pet_id, kind, title) values ($1, $2, 'vet_passport', 'Паспорт') returning id`,
    [userId, petId],
  )
  return rows[0]!.id
}

async function file(documentId: string, userId: string, position = 0): Promise<void> {
  await db.query(
    `insert into public.pet_document_files (document_id, user_id, position, object_path, content_type, size_bytes)
     values ($1, $2::uuid, $3, $2::uuid::text || '/' || gen_random_uuid(), 'image/jpeg', 1000)`,
    [documentId, userId, position],
  )
}

const count = async (sql: string, params: unknown[] = []) => Number((await db.query<{ n: string }>(sql, params)).rows[0]!.n)

describe('pet document tables', () => {
  it('anon and authenticated cannot read the tables', async () => {
    const id = await document(seeded.ownerAId, PET_IDS.aCat)
    await file(id, seeded.ownerAId)

    const token = await signIn(OWNER_A.email)
    const anon = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const authenticated = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    for (const client of [anon, authenticated]) {
      for (const table of ['pet_documents', 'pet_document_files']) {
        const { data, error } = await client.from(table).select('*')
        expect({ table, error: error?.code, rows: data?.length ?? 0 }).toEqual({ table, error: '42501', rows: 0 })
      }
    }
  })

  it('late write after deletion request is refused', async () => {
    const id = await document(seeded.ownerAId, PET_IDS.aCat)
    await requestDeletion(db, seeded.ownerAId)

    await expect(document(seeded.ownerAId, PET_IDS.aCat)).rejects.toThrow(/not accepting writes/)
    await expect(file(id, seeded.ownerAId)).rejects.toThrow(/not accepting writes/)
    await expect(db.query(`update public.pet_documents set title = 'x' where id = $1`, [id])).rejects.toThrow(
      /not accepting writes/,
    )
  })

  it('keeps one file per position, one object per path, and a title within 100 characters', async () => {
    const id = await document(seeded.ownerAId, PET_IDS.aCat)
    await file(id, seeded.ownerAId, 0)
    await expect(file(id, seeded.ownerAId, 0)).rejects.toThrow(/duplicate key/)
    await expect(
      db.query(`update public.pet_documents set title = $2 where id = $1`, [id, 'я'.repeat(101)]),
    ).rejects.toThrow(/check constraint/)
    await expect(
      db.query(`update public.pet_documents set status = 'done' where id = $1`, [id]),
    ).rejects.toThrow(/check constraint/)
  })
})

describe('delete_account_data', () => {
  it('delete_account_data removes documents', async () => {
    // A medical record next to the documents: the function must not trip over either.
    const { rows: [visit] } = await db.query<{ id: string }>(
      `insert into public.pet_health_events (user_id, pet_id, kind, status, event_date)
       values ($1, $2, 'visit', 'done', current_date) returning id`,
      [seeded.ownerAId, PET_IDS.aCat],
    )
    await db.query(
      `insert into public.pet_health_items (event_id, user_id, pet_id, name) values ($1, $2, $3, 'Нефростоп')`,
      [visit!.id, seeded.ownerAId, PET_IDS.aCat],
    )
    const own = await document(seeded.ownerAId, PET_IDS.aCat)
    await file(own, seeded.ownerAId, 0)
    await file(own, seeded.ownerAId, 1)
    const other = await document(seeded.ownerBId, PET_IDS.bCat)
    await file(other, seeded.ownerBId)
    await requestDeletion(db, seeded.ownerAId)

    await db.query(`select public.delete_account_data($1)`, [seeded.ownerAId])

    expect(await count(`select count(*) n from public.pet_documents where user_id = $1`, [seeded.ownerAId])).toBe(0)
    expect(await count(`select count(*) n from public.pet_document_files where user_id = $1`, [seeded.ownerAId])).toBe(0)
    expect(await count(`select count(*) n from public.pet_documents where user_id = $1`, [seeded.ownerBId])).toBe(1)
    expect(await count(`select count(*) n from public.pet_document_files where user_id = $1`, [seeded.ownerBId])).toBe(1)
  })
})
