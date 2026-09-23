import { describe, expect, it } from 'vitest'
import { describePetProfile } from '@/server/symptom-check/analyze-symptom-check'
import type { Pet } from '@/shared/types'

const pet: Pet = {
  id: 'pet-1',
  user_id: 'user-1',
  species: 'dog',
  name: 'Rex',
  breed: null,
  age_years: 4,
  weight_kg: 12.5,
  sex: null,
  neutered: null,
  indoor_outdoor: null,
  diet: null,
  size_class: null,
  walk_activity: null,
  allergies: [],
  vaccinated: null,
  chronic_conditions: [],
  medications: [],
  notes: null,
  created_at: '2026-09-01T00:00:00Z',
}

describe('the pet profile the model reads', () => {
  it('includes the weight, which decides whether a swallowed dose is dangerous', () => {
    expect(describePetProfile(pet, 'dog')).toContain('weight: 12.5 kg')
  })

  it('leaves the weight out when the owner never gave one', () => {
    expect(describePetProfile({ ...pet, weight_kg: null }, 'dog')).not.toContain('weight')
  })
})
