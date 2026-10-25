import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PET_AVATAR_FEATURE, FEATURES_HEADER, type Pet } from '@lapka/contracts'
import { presentPet } from '@/server/pets/pet-contract'
import { signAvatars } from '@/server/pets/avatar-service'

vi.mock('@/server/pets/avatar-service', () => ({ signAvatars: vi.fn() }))

const pet = {
  id: '11111111-1111-4111-8111-000000000001', species: 'cat', name: 'Мурка', breed: null, age_years: 4, weight_kg: 4.2,
  sex: 'female', neutered: true, indoor_outdoor: null, diet: null, size_class: null, walk_activity: null, allergies: [],
  vaccinated: null, chronic_conditions: [], medications: [], notes: null, birth_date: null, birth_date_approx: false,
  adopted_on: null, avatar_url: null, created_at: '2026-01-01T00:00:00.000Z',
} as unknown as Pet

/** A client that must not be read from: the caller already has the path. */
const noReads = { from: () => { throw new Error('the pets table was read again') } } as never

describe('presenting one pet', () => {
  beforeEach(() => vi.mocked(signAvatars).mockClear())

  it('signs the photo from the path the caller already has, without reading the pet again', async () => {
    vi.mocked(signAvatars).mockResolvedValue(['https://signed/murka.jpg'])
    const request = new Request('http://test.local/x', { headers: { [FEATURES_HEADER]: PET_AVATAR_FEATURE } })

    const shown = await presentPet(request, noReads, pet, 'u/murka.jpg')

    expect(shown.avatar_url).toBe('https://signed/murka.jpg')
    expect(signAvatars).toHaveBeenCalledWith(noReads, ['u/murka.jpg'])
  })

  it('leaves the photo out for a client that does not read it', async () => {
    const shown = await presentPet(new Request('http://test.local/x'), noReads, pet, 'u/murka.jpg')

    expect('avatar_url' in shown).toBe(false)
    expect(signAvatars).not.toHaveBeenCalled()
  })
})
