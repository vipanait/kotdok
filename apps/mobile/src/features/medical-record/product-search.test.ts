import { describe, expect, it } from 'vitest'
import type { HealthProduct } from '@lapka/contracts'
import { SUGGESTIONS_MAX, suggestProducts } from './product-search'

function product(name: string, popular = false, aliases: string[] = []): HealthProduct {
  return {
    id: `00000000-0000-4000-8000-${String(name.length).padStart(12, '0')}`,
    kind: 'vaccine',
    name,
    manufacturer: null,
    aliases,
    species: ['cat'],
    form: null,
    targets: [],
    interval: null,
    popular,
  }
}

const catalog = [product('Нобивак Tricat Trio', true), product('Нобивак Rabies', true), product('Пуревакс RCP'), product('Мультифел-4')]

describe('suggestions under the product field', () => {
  it('offers the popular ones before anything is typed', () => {
    const shown = suggestProducts(catalog, '  ')
    expect(shown).toEqual({ kind: 'popular', products: [catalog[0], catalog[1]] })
  })

  it('does not search on one or two letters', () => {
    expect(suggestProducts(catalog, 'но')).toEqual({ kind: 'typing' })
  })

  it('searches from the third letter, whatever the case or keyboard layout', () => {
    expect(suggestProducts(catalog, 'НОБ')).toEqual({ kind: 'results', products: [catalog[0], catalog[1]] })
    expect(suggestProducts(catalog, 'yj,bd')).toEqual({ kind: 'results', products: [catalog[0], catalog[1]] })
  })

  it('says so when nothing matches, so the typed name is kept as the owner wrote it', () => {
    expect(suggestProducts(catalog, 'Фелоцел')).toEqual({ kind: 'nothing' })
  })

  it('shows no more rows than fit above the rest of the form', () => {
    const many = Array.from({ length: 10 }, (_, index) => product(`Вакцина ${'x'.repeat(index + 1)}`))
    const shown = suggestProducts(many, 'Вакцина')
    expect(shown.kind === 'results' && shown.products).toHaveLength(SUGGESTIONS_MAX)
  })
})
