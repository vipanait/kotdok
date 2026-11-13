import { describe, expect, it } from 'vitest'
import type { SafetyAskResult, SafetyItem, SafetySpeciesSection } from '@lapka/contracts'
import { cardFromAi, cardFromItem } from './card-model'

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
      sources: ['ASPCA', 'MSD'],
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
