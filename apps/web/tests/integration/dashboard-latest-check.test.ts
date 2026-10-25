import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { loadPetsOverview } from '@/server/dashboard/load-dashboard'
import { CHECK_IDS, PET_IDS, connect, seedFixtures } from './fixtures'

/**
 * A pet row names the pet's own latest check. The fixtures give owner A two
 * pets with one check each; many later checks of the cat must not make the
 * dog's check disappear from its row, however many there are.
 */
let db: Client
let ownerAId: string

const TODAY = '2026-06-15'
const MANY = 60

beforeAll(async () => {
  db = await connect()
  ;({ ownerAId } = await seedFixtures(db))
  // The cat is checked many times after the dog's one check.
  const values = Array.from({ length: MANY }, (_, i) =>
    `(gen_random_uuid(), '${ownerAId}', '${PET_IDS.aCat}', 'check ${i}', 'home_care', 'r', array['c'], null, array['s'], array['q'], '{}'::jsonb, timestamp '2026-06-01 10:00:00' + make_interval(mins => ${i}), null)`,
  ).join(',\n')
  await db.query(
    `insert into public.symptom_checks
       (id, user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes,
        species_specific_warning, home_care_steps, vet_questions, full_response, created_at, deleted_at)
     values ${values}`,
  )
})

afterAll(async () => {
  await db?.end()
})

describe('the latest check of each pet on the pet list', () => {
  it('is found for every pet, not only within the newest checks of the owner', async () => {
    const { latestChecksByPet } = await loadPetsOverview(ownerAId, TODAY)

    expect(latestChecksByPet[PET_IDS.aCat]?.urgency).toBe('home_care')
    expect(latestChecksByPet[PET_IDS.aCat]?.created_at).toBe(`2026-06-01T${String(Math.floor((MANY - 1) / 60) + 10).padStart(2, '0')}:${String((MANY - 1) % 60).padStart(2, '0')}:00.000Z`)
    // The dog's only check (CHECK_IDS.aSecond) is older than all of the cat's.
    expect(latestChecksByPet[PET_IDS.aDog]).toEqual({ urgency: 'urgent', created_at: '2026-05-01T10:00:00.000Z' })
    expect(CHECK_IDS.aSecond).toBeTruthy()
  })

  it('leaves out deleted checks and pets with none', async () => {
    const { latestChecksByPet, pets } = await loadPetsOverview(ownerAId, TODAY)
    expect(Object.keys(latestChecksByPet).sort()).toEqual([PET_IDS.aCat, PET_IDS.aDog].sort())
    expect(pets.length).toBeGreaterThanOrEqual(2)
  })
})
