import { describe, expect, it } from 'vitest'
import type { Pet } from '@lapka/contracts'
import { defaultSubject, subjectSpecies } from './subject'

const pet = (id: string, name: string, species: Pet['species']): Pet => ({
  id,
  species,
  name,
  breed: null,
  age_years: null,
  weight_kg: null,
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
  birth_date: null,
  birth_date_approx: false,
  adopted_on: null,
  avatar_url: null,
  created_at: '2026-09-01T00:00:00.000Z',
})

const rex = pet('11111111-1111-4111-8111-000000000001', 'Рекс', 'dog')
const barsik = pet('11111111-1111-4111-8111-000000000002', 'Барсик', 'cat')

describe('who the question is about', () => {
  it('is a cat when there are no pets', () => {
    expect(defaultSubject([], null)).toEqual({ kind: 'species', species: 'cat' })
  })

  it('is the pet chosen last', () => {
    expect(defaultSubject([rex, barsik], barsik.id)).toMatchObject({ kind: 'pet', petId: barsik.id })
  })

  it('is the first pet when the last one chosen is gone', () => {
    expect(defaultSubject([rex], 'удалённый-id')).toMatchObject({ kind: 'pet', petId: rex.id })
    expect(defaultSubject([rex, barsik], null)).toEqual({ kind: 'pet', petId: rex.id, name: 'Рекс', species: 'dog' })
  })

  it('answers for the species either way', () => {
    expect(subjectSpecies({ kind: 'species', species: 'dog' })).toBe('dog')
    expect(subjectSpecies(defaultSubject([barsik], null))).toBe('cat')
  })
})
