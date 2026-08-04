import { describe, expect, it } from 'vitest'
import { sanitizeCat } from '@/shared/utils/cat-utils'

describe('sanitizeCat', () => {
  it('normalizes supported cat profile fields', () => {
    expect(sanitizeCat({
      name: '  Барсик  ',
      breed: '  Siberian  ',
      age_years: '4.5',
      weight_kg: '6.2',
      sex: 'male',
      neutered: 'yes',
      indoor_outdoor: 'both',
      diet: 'mixed',
      allergies: [' fish ', '', null],
      vaccinated: 1,
      chronic_conditions: ['asthma'],
      medications: [' inhaler '],
      notes: '  Needs evening meds  ',
    })).toEqual({
      name: 'Барсик',
      breed: 'Siberian',
      age_years: 4.5,
      weight_kg: 6.2,
      sex: 'male',
      neutered: true,
      indoor_outdoor: 'both',
      diet: 'mixed',
      allergies: ['fish'],
      vaccinated: true,
      chronic_conditions: ['asthma'],
      medications: ['inhaler'],
      notes: 'Needs evening meds',
    })
  })

  it('parses decimal weight with a comma separator', () => {
    expect(sanitizeCat({ name: 'Барсик', weight_kg: '4,5' }).weight_kg).toBe(4.5)
  })

  it('falls back safely for unsupported values and long free text', () => {
    const result = sanitizeCat({
      name: '   ',
      sex: 'unknown',
      indoor_outdoor: 'space',
      diet: 'pizza',
      allergies: Array.from({ length: 25 }, (_, i) => `allergy-${i}`),
      notes: 'x'.repeat(400),
    })

    expect(result.name).toBe('Кот')
    expect(result.sex).toBeNull()
    expect(result.indoor_outdoor).toBeNull()
    expect(result.diet).toBeNull()
    expect(result.allergies).toHaveLength(20)
    expect(result.notes).toHaveLength(300)
  })
})
