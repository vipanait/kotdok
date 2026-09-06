import { describe, expect, it } from 'vitest'
import { sanitizePet } from '@/shared/utils/pet-utils'

describe('sanitizePet', () => {
  it('normalizes supported pet profile fields', () => {
    expect(sanitizePet({
      species: 'dog',
      name: '  Барсик  ',
      breed: '  Siberian  ',
      age_years: '4.5',
      weight_kg: '6.2',
      sex: 'male',
      neutered: 'yes',
      indoor_outdoor: 'both',
      diet: 'mixed',
      size_class: 'large',
      walk_activity: 'daily_long',
      allergies: [' fish ', '', null],
      vaccinated: 1,
      chronic_conditions: ['asthma'],
      medications: [' inhaler '],
      notes: '  Needs evening meds  ',
    })).toEqual({
      species: 'dog',
      name: 'Барсик',
      breed: 'Siberian',
      age_years: 4.5,
      weight_kg: 6.2,
      sex: 'male',
      neutered: true,
      indoor_outdoor: 'both',
      diet: 'mixed',
      size_class: 'large',
      walk_activity: 'daily_long',
      allergies: ['fish'],
      vaccinated: true,
      chronic_conditions: ['asthma'],
      medications: ['inhaler'],
      notes: 'Needs evening meds',
    })
  })

  it('parses decimal weight with a comma separator', () => {
    expect(sanitizePet({ name: 'Барсик', weight_kg: '4,5' }).weight_kg).toBe(4.5)
  })

  it('falls back safely for unsupported values and long free text', () => {
    const result = sanitizePet({
      name: '   ',
      sex: 'unknown',
      indoor_outdoor: 'space',
      diet: 'pizza',
      size_class: 'huge',
      walk_activity: 'never',
      allergies: Array.from({ length: 25 }, (_, i) => `allergy-${i}`),
      notes: 'x'.repeat(400),
    })

    expect(result.species).toBe('cat')
    expect(result.name).toBe('Кот')
    expect(result.sex).toBeNull()
    expect(result.indoor_outdoor).toBeNull()
    expect(result.diet).toBeNull()
    expect(result.size_class).toBeNull()
    expect(result.walk_activity).toBeNull()
    expect(result.allergies).toHaveLength(20)
    expect(result.notes).toHaveLength(300)
  })

  it('defaults dog name when empty', () => {
    expect(sanitizePet({ species: 'dog', name: '  ' }).name).toBe('Пёс')
  })

  it('clears dog-only fields for cats', () => {
    const result = sanitizePet({
      species: 'cat',
      name: 'Мурка',
      size_class: 'medium',
      walk_activity: 'sport',
    })
    expect(result.size_class).toBeNull()
    expect(result.walk_activity).toBeNull()
  })
})
