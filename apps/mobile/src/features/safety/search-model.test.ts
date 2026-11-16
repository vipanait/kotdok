import { describe, expect, it } from 'vitest'
import type { SafetyIndexItem } from '@lapka/contracts'
import { homeHeading, isSearching, recentShown, searchView } from './search-model'

const entry = (slug: string, name: string, category: SafetyIndexItem['category'], aliases: string[] = []): SafetyIndexItem => ({
  slug,
  name,
  category,
  aliases,
  verdict: { cat: 'danger', dog: 'danger' },
})

const index: SafetyIndexItem[] = [
  entry('shokolad', 'Шоколад', 'food'),
  entry('vinograd', 'Виноград и изюм', 'food', ['изюм']),
  entry('liliya', 'Лилия', 'plant'),
  entry('ibuprofen', 'Ибупрофен', 'medicine', ['нурофен']),
  entry('antifriz', 'Антифриз', 'household'),
  entry('hlorofitum', 'Хлорофитум', 'plant'),
  entry('banan', 'Банан', 'food'),
]

describe('what the search shows', () => {
  it('waits for the index', () => {
    expect(searchView(null, '', null)).toEqual({ kind: 'loading' })
  })

  it('says the reference is empty when nothing is published, and still lets a typed query miss into the AI question', () => {
    expect(searchView([], '', null)).toEqual({ kind: 'emptyCatalogue' })
    expect(searchView([], 'киви', null)).toEqual({ kind: 'miss', elsewhere: false })
  })

  it('lists the popular entries first when nothing is typed', () => {
    const view = searchView(index, '', null)
    expect(view.kind).toBe('popular')
    if (view.kind !== 'popular') return
    expect(view.rows.slice(0, 3).map((row) => row.item.slug)).toEqual(['shokolad', 'vinograd', 'liliya'])
  })

  it('gives each row its own picture, or its category’s for a slug without one', () => {
    const view = searchView(index, '', null)
    if (view.kind !== 'popular') throw new Error(view.kind)
    const icon = Object.fromEntries(view.rows.map((row) => [row.item.slug, row.icon]))
    expect(icon).toMatchObject({
      shokolad: 'chocolate',
      vinograd: 'grapes',
      liliya: 'flower',
      ibuprofen: 'pills',
      antifriz: 'household',
      hlorofitum: 'plant',
      banan: 'apple',
    })
  })

  it('shows one category by name when a chip is chosen', () => {
    const view = searchView(index, '', 'plant')
    expect(view).toMatchObject({ kind: 'category' })
    if (view.kind !== 'category') return
    expect(view.rows.map((row) => row.item.slug)).toEqual(['liliya', 'hlorofitum'])
  })

  it('finds by alias and by a typo, within the chosen category', () => {
    const alias = searchView(index, 'нурофен', null)
    expect(alias.kind === 'results' && alias.rows.map((row) => row.item.slug)).toEqual(['ibuprofen'])
    const typo = searchView(index, 'шоколат', 'food')
    expect(typo.kind === 'results' && typo.rows[0].item.slug).toBe('shokolad')
  })

  it('tells a miss in the chosen category from a miss everywhere', () => {
    expect(searchView(index, 'лилия', 'food')).toEqual({ kind: 'miss', elsewhere: true })
    expect(searchView(index, 'кумкват', 'food')).toEqual({ kind: 'miss', elsewhere: false })
    expect(searchView(index, 'кумкват', null)).toEqual({ kind: 'miss', elsewhere: false })
  })
})

describe('while a query is typed (handoff, «Уточнение: поиск…»)', () => {
  const t = { title: 'Можно ли это питомцу?', lead: 'Пояснение', searchTitle: 'Поиск по справочнику' }

  it('names the screen «Поиск по справочнику» and drops the lead', () => {
    expect(homeHeading(t, '')).toEqual({ title: t.title, lead: t.lead })
    expect(homeHeading(t, 'шок')).toEqual({ title: t.searchTitle, lead: null })
    // Spaces and punctuation are not a query: the screen stays as it was.
    expect(homeHeading(t, '  ')).toEqual({ title: t.title, lead: t.lead })
    expect(isSearching(' ? ')).toBe(false)
  })

  it('hides the recent queries while typing and brings them back once the field is cleared', () => {
    const recent = ['Шоколад', 'Лилия']
    expect(recentShown('', recent)).toEqual(recent)
    expect(recentShown('лил', recent)).toEqual([])
    expect(recentShown('', [])).toEqual([])
  })
})
