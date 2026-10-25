import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { CHECK_HISTORY_LIMIT, loadCheckHistory, loadCheckPet } from '@/server/checks/load-check-pages'
import { CHECK_IDS, PET_IDS, connect, seedFixtures } from './fixtures'

/**
 * What the check history page reads. The page lists rows, so it is given the
 * newest `CHECK_HISTORY_LIMIT` checks without their full answers, and one pet
 * by its id rather than the owner's whole list.
 */
let db: Client
let ownerAId: string
let ownerBId: string

beforeAll(async () => {
  db = await connect()
  ;({ ownerAId, ownerBId } = await seedFixtures(db))
})

afterAll(async () => {
  await db?.end()
})

describe('the history page', () => {
  it('lists the owner’s live checks, newest first, without the full answer', async () => {
    const checks = await loadCheckHistory(ownerAId)

    expect(checks.map((check) => check.id).sort()).toEqual([CHECK_IDS.aFirst, CHECK_IDS.aSecond].sort())
    expect(checks.every((check) => check.full_response === null)).toBe(true)
    expect(checks[0]!.created_at).toBe('2026-05-01T10:00:00.000Z')
    expect(CHECK_HISTORY_LIMIT).toBeGreaterThanOrEqual(100)
  })

  it('narrows to one pet', async () => {
    const checks = await loadCheckHistory(ownerAId, PET_IDS.aDog)

    expect(checks.map((check) => check.id)).toEqual([CHECK_IDS.aSecond])
  })

  it('finds the owner’s pet by id and nobody else’s', async () => {
    await expect(loadCheckPet(ownerAId, PET_IDS.aCat)).resolves.toEqual({ id: PET_IDS.aCat, name: 'Мурка' })
    await expect(loadCheckPet(ownerBId, PET_IDS.aCat)).resolves.toBeNull()
    await expect(loadCheckPet(ownerBId, PET_IDS.bDeleted)).resolves.toBeNull()
  })
})
