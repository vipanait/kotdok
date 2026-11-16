import { describe, expect, it } from 'vitest'
import { petSafetyNotes } from './pet-notes'

const chicken = { name: 'Курица', aliases: ['курица', 'куриное мясо', 'курятина'] }

describe('petSafetyNotes', () => {
  it('matches an allergy only by a whole name or alias, not by another word form', () => {
    // «курицу» is not «курица»: word forms are covered by aliases, not by morphology.
    expect(petSafetyNotes({ allergies: ['на курицу и говядину'], chronic_conditions: [] }, chicken, 'safe')).toEqual([])
  })

  it('notes an allergy that equals the name, keeping the owner’s wording', () => {
    expect(petSafetyNotes({ allergies: ['Курица'], chronic_conditions: [] }, chicken, 'safe')).toEqual([
      { kind: 'allergy', allergy: 'Курица' },
    ])
  })

  it('notes an allergy that holds an alias as a whole word', () => {
    expect(petSafetyNotes({ allergies: ['курятина, рыба'], chronic_conditions: [] }, chicken, 'caution')).toEqual([
      { kind: 'allergy', allergy: 'курятина, рыба' },
    ])
  })

  it('does not match a word inside another word', () => {
    expect(petSafetyNotes({ allergies: ['рис'], chronic_conditions: [] }, { name: 'Барбарис', aliases: [] }, 'safe')).toEqual([])
  })

  it('ignores blank allergy lines', () => {
    expect(petSafetyNotes({ allergies: ['', '  '], chronic_conditions: [] }, chicken, 'safe')).toEqual([])
  })

  it('adds the chronic-conditions line unless the verdict is already danger', () => {
    expect(petSafetyNotes({ allergies: [], chronic_conditions: ['ХБП'] }, chicken, 'safe')).toEqual([{ kind: 'chronic' }])
    expect(petSafetyNotes({ allergies: [], chronic_conditions: ['ХБП'] }, chicken, 'unknown')).toEqual([{ kind: 'chronic' }])
    expect(petSafetyNotes({ allergies: [], chronic_conditions: ['ХБП'] }, chicken, 'danger')).toEqual([])
    expect(petSafetyNotes({ allergies: [], chronic_conditions: [' '] }, chicken, 'safe')).toEqual([])
  })

  it('lists allergy notes before the chronic line', () => {
    expect(petSafetyNotes({ allergies: ['курица'], chronic_conditions: ['ХБП'] }, chicken, 'caution')).toEqual([
      { kind: 'allergy', allergy: 'курица' },
      { kind: 'chronic' },
    ])
  })
})
