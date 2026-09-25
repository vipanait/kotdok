import { describe, expect, it } from 'vitest'
import type { HealthEvent } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { dueItems, itemTitle, parasiteStatuses } from './due'
import { blankDraft, blankItem, nextDate, pickProduct, readDraft, toggleGroup } from './event-form'

const TODAY = '2026-09-24'
const NOW = new Date(2026, 8, 24, 12, 0)

function event(overrides: Partial<HealthEvent>): HealthEvent {
  return { id: 'e', kind: 'parasite', status: 'done', date: '2026-06-20', clinic: null, notes: null, items: [], visit_kind: null, reason: null, diagnosis: null, check_id: null, ...overrides }
}
const item = (id: string, targets: string[], name: string | null = null) => ({
  id, name, targets, source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null,
})

const bravecto = {
  id: '11111111-1111-4111-8111-0000000000c1',
  kind: 'antiparasitic' as const,
  name: 'Бравекто',
  manufacturer: 'MSD',
  aliases: [],
  species: ['dog' as const],
  form: 'tablet',
  targets: ['fleas', 'ticks'],
  interval: { value: 12, unit: 'week' as const },
  popular: true,
}

describe('next dates of treatments (MR-05.1)', () => {
  it('Бравекто every 12 weeks from 24.09.2026 is 17.12.2026; every 3 months is 24.12.2026', () => {
    const twelveWeeks = pickProduct({ ...blankItem('a'), kind: 'parasite' }, bravecto)
    expect(nextDate(twelveWeeks, '2026-09-24', TODAY)).toBe('2026-12-17')
    const threeMonths = pickProduct({ ...blankItem('b'), kind: 'parasite' }, { ...bravecto, interval: { value: 3, unit: 'month' } })
    expect(nextDate(threeMonths, '2026-09-24', TODAY)).toBe('2026-12-24')
  })

  it('without a product suggests a month for fleas and ticks and three months for worms', () => {
    const fleas = { ...blankItem('a'), kind: 'parasite' as const, targets: ['fleas' as const] }
    expect(nextDate(fleas, '2026-09-24', TODAY)).toBe('2026-10-24')
    const worms = { ...blankItem('b'), kind: 'parasite' as const, targets: ['worms' as const] }
    expect(nextDate(worms, '2026-09-24', TODAY)).toBe('2026-12-24')
  })
})

describe('the form for a treatment', () => {
  it('toggles a group: a combined product’s finer codes go with their group', () => {
    const picked = { ...blankItem('a'), kind: 'parasite' as const, targets: ['fleas' as const, 'ear_mites' as const] }
    expect(toggleGroup(picked, 'ticks').targets).toEqual(['fleas'])
    expect(toggleGroup(picked, 'worms').targets).toEqual(['fleas', 'ear_mites', 'worms'])
  })

  it('sends kind parasite', () => {
    const draft = { ...blankDraft('done', NOW, 'parasite'), items: [{ ...blankItem('a'), kind: 'parasite' as const, targets: ['worms' as const] }] }
    const read = readDraft(ru, draft, 'new', NOW)
    expect(read.ok && read.value.kind).toBe('parasite')
  })
})

describe('parasite groups on the screens (MR-05.3)', () => {
  const combined = event({ id: 'd', date: '2026-07-05', items: [item('x', ['fleas', 'ticks', 'worms'], 'Инспектор')] })
  const plan = event({ id: 'p', status: 'planned', date: '2026-10-05', items: [item('y', ['fleas', 'ticks', 'worms'], 'Инспектор')] })

  it('shows one combined product under both groups', () => {
    const [fleasTicks, worms] = parasiteStatuses(ru, [combined, plan], TODAY)
    expect(fleasTicks).toMatchObject({ group: 'fleasTicks', last: '5 июля', product: 'Инспектор' })
    expect(worms).toMatchObject({ group: 'worms', last: '5 июля', product: 'Инспектор' })
    expect(fleasTicks.next?.text).toBe('Через 11 дней · 5 октября')
  })

  it('keeps it one due row, titled by what it covers', () => {
    const due = dueItems([plan])
    expect(due).toHaveLength(1)
    expect(itemTitle(ru, due[0].item, 'parasite')).toBe('Блохи, клещи и глисты')
    expect(itemTitle(ru, item('a', ['fleas', 'ticks']), 'parasite')).toBe('Блохи и клещи')
    expect(itemTitle(ru, item('a', ['worms']), 'parasite')).toBe('Глисты')
  })

  it('says nothing about a group with no treatments', () => {
    const [fleasTicks, worms] = parasiteStatuses(ru, [event({ items: [item('x', ['worms'])] })], TODAY)
    expect(fleasTicks).toMatchObject({ last: null, next: null })
    expect(worms.last).toBe('20 июня')
  })
})
