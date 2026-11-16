import { describe, expect, it } from 'vitest'
import type { SafetyAskResult, SafetyItem, SafetySpeciesSection } from '@lapka/contracts'
import { cardBlocks, cardFromAi, cardFromItem, entryPlaceholder, entryView, shownSpecies } from './card-model'

const danger: SafetySpeciesSection = {
  verdict: 'danger',
  summary: 'Нельзя.',
  why: 'Отказ почек.',
  signs: ['рвота'],
  if_eaten: 'call_now',
}

const grapes: SafetyItem = {
  slug: 'vinograd',
  category: 'food',
  name: 'Виноград и изюм',
  by_species: { cat: { ...danger, summary: 'Кошкам нельзя.' }, dog: { ...danger, summary: 'Собакам нельзя.' } },
  first_steps: ['Позвоните в клинику'],
  avoid: ['Не вызывайте рвоту сами — только по указанию врача'],
  toxin_slug: null,
  sources: [{ title: 'ASPCA', url: 'https://www.aspca.org/' }, { title: 'MSD' }],
  pet: null,
  pet_notes: [],
}

const ibuprofen: SafetyItem = { ...grapes, slug: 'ibuprofen', category: 'medicine', name: 'Ибупрофен' }

const carrot: SafetyItem = {
  ...grapes,
  slug: 'morkov',
  name: 'Морковь',
  by_species: {
    cat: { verdict: 'caution', summary: 'Изредка.', why: 'Варёная.', signs: [], if_eaten: 'none' },
    dog: { verdict: 'safe', summary: 'Можно.', why: 'Лакомство.', signs: [], if_eaten: 'none' },
  },
  first_steps: [],
  avoid: [],
  pet: { id: '11111111-1111-4111-8111-000000000001', species: 'cat' },
  pet_notes: [{ kind: 'chronic' }],
}

const aiAnswer: Extract<SafetyAskResult, { source: 'ai' }> = {
  source: 'ai',
  species: 'dog',
  category: 'food',
  title: 'Драконий фрукт',
  verdict: 'unknown',
  summary: 'Надёжных данных нет.',
  why: '',
  signs: [],
  if_eaten: 'watch',
  first_steps: ['Позвоните в клинику'],
  avoid: [],
  pet_notes: [],
  remaining_today: 9,
}

describe('the card a reference entry draws', () => {
  it('shows the section of the species asked about, and the other one folded', () => {
    expect(cardFromItem(grapes, 'dog')).toMatchObject({
      title: 'Виноград и изюм',
      verdict: 'danger',
      fromAi: false,
      label: 'cannot',
      medicineLine: false,
      summary: 'Собакам нельзя.',
      ifEaten: 'call_now',
      otherSpecies: { species: 'cat', verdict: 'danger', label: 'cannot' },
      sources: [{ title: 'ASPCA', url: 'https://www.aspca.org/' }, { title: 'MSD' }],
    })
  })

  it('captions a medicine by its own question and adds the fixed line', () => {
    expect(cardFromItem(ibuprofen, 'cat')).toMatchObject({ label: 'dangerous', medicineLine: true })
  })

  it('carries the pet notes the server made', () => {
    expect(cardFromItem(carrot, 'cat')).toMatchObject({
      verdict: 'caution',
      label: 'caution',
      notes: [{ kind: 'chronic' }],
      otherSpecies: { species: 'dog', verdict: 'safe', label: 'can' },
    })
    expect(cardFromItem(carrot, 'dog')).toMatchObject({ label: 'can', ifEaten: 'none' })
  })
})

describe('the card an AI answer draws', () => {
  it('is marked as AI, with no sources and no second species', () => {
    expect(cardFromAi(aiAnswer)).toMatchObject({
      title: 'Драконий фрукт',
      fromAi: true,
      verdict: 'unknown',
      label: 'noData',
      sources: [],
      otherSpecies: null,
      ifEaten: 'watch',
      firstSteps: ['Позвоните в клинику'],
    })
  })

  it('adds the medicine line to a medicine', () => {
    expect(cardFromAi({ ...aiAnswer, category: 'medicine', verdict: 'danger' })).toMatchObject({
      label: 'dangerous',
      medicineLine: true,
    })
  })
})

describe('the entry screen before the server answers', () => {
  const known = { slug: 'vinograd', category: 'food' as const, name: 'Виноград', aliases: [], verdict: { cat: 'danger' as const, dog: 'caution' as const } }

  it('stands in with the index’s name and verdict while loading', () => {
    expect(entryPlaceholder(known, 'dog', false)).toEqual({ title: 'Виноград', verdict: { verdict: 'caution', label: 'caution' } })
  })

  it('keeps the name but drops the possibly stale verdict once loading failed', () => {
    expect(entryPlaceholder(known, 'dog', true)).toEqual({ title: 'Виноград', verdict: null })
  })

  it('has nothing to stand in with for an entry the index does not know', () => {
    expect(entryPlaceholder(undefined, 'cat', false)).toEqual({ title: undefined, verdict: null })
  })
})

describe('the order of a card', () => {
  const allergic: SafetyItem = {
    ...carrot,
    pet_notes: [{ kind: 'allergy', allergy: 'курица' }, { kind: 'chronic' }],
  }

  it('puts the actions for «call now» before the explanation, and keeps the check inside them', () => {
    const blocks = cardBlocks(cardFromItem(grapes, 'dog'), 'Рекс')
    expect(blocks).toEqual(['verdict', 'ifEaten', 'why', 'signs', 'otherSpecies', 'sources'])
    expect(blocks.indexOf('ifEaten')).toBeLessThan(blocks.indexOf('why'))
  })

  it('shows the allergy above the verdict and the chronic note under it, only for the pet', () => {
    const model = cardFromItem(allergic, 'dog')
    expect(cardBlocks(model, 'Рекс').slice(0, 3)).toEqual(['allergy', 'verdict', 'chronic'])
    // A species, or the other species under a pet's card: none of the pet's notes.
    expect(cardBlocks(model, null)).not.toContain('allergy')
    expect(cardBlocks(model, null)).not.toContain('chronic')
  })

  it('leaves out «if eaten» for `none`, and empty explanation and signs', () => {
    const blocks = cardBlocks(cardFromItem({ ...carrot, pet_notes: [] }, 'dog'), null)
    expect(blocks).toEqual(['verdict', 'why', 'otherSpecies', 'sources'])
  })

  it('draws an AI «danger» with «call now» like a reference one: actions first, no refine card', () => {
    const urgent = cardFromAi({ ...aiAnswer, verdict: 'danger', if_eaten: 'call_now', why: 'Отравление.', signs: ['рвота'] })
    expect(urgent).toMatchObject({ fromAi: true, verdict: 'danger', label: 'cannot', ifEaten: 'call_now' })
    expect(cardBlocks(urgent, 'Рекс')).toEqual(['verdict', 'ifEaten', 'why', 'signs'])
  })

  it('offers to refine the name only under an AI «no data», after its actions', () => {
    expect(cardBlocks(cardFromAi(aiAnswer), null)).toEqual(['verdict', 'ifEaten', 'refine'])
    expect(cardBlocks(cardFromAi({ ...aiAnswer, verdict: 'caution' }), null)).not.toContain('refine')
  })
})

describe('the species an entry screen shows', () => {
  const rex = '11111111-1111-4111-8111-000000000002'
  const grapesForRex = entryView('vinograd', 'dog', rex)

  it('is the asked one until the other is folded open', () => {
    expect(shownSpecies(null, grapesForRex, 'dog')).toBe('dog')
    expect(shownSpecies({ view: grapesForRex, species: 'cat' }, grapesForRex, 'dog')).toBe('cat')
  })

  it('starts again from the asked species when the screen is reused for another entry, pet or species', () => {
    const flip = { view: grapesForRex, species: 'cat' as const }
    expect(shownSpecies(flip, entryView('kuritsa-varenaya', 'dog', rex), 'dog')).toBe('dog')
    expect(shownSpecies(flip, entryView('vinograd', 'cat', '11111111-1111-4111-8111-000000000001'), 'cat')).toBe('cat')
    expect(shownSpecies(flip, entryView('vinograd', 'dog', null), 'dog')).toBe('dog')
  })
})
