import { describe, expect, it } from 'vitest'
import type { HealthEvent } from '@lapka/contracts'
import {
  coreVaccinations,
  fallbackInterval,
  nextDayOf,
  suggestNextDay,
  toggleParasiteGroup,
  vaccineTargetsFor,
} from './event-entry'

function event(partial: Partial<HealthEvent> & Pick<HealthEvent, 'id' | 'status' | 'date' | 'items'>): HealthEvent {
  return {
    kind: 'vaccination',
    clinic: null,
    notes: null,
    visit_kind: null,
    reason: null,
    diagnosis: null,
    check_id: null,
    ...partial,
  }
}

function item(id: string, targets: string[], source_item_id: string | null = null) {
  return { id, name: null, targets, source_item_id, product_id: null, interval: null, instructions: null, medication_id: null }
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('vaccination targets', () => {
  it('lists a species’ own diseases, core first, and never another species’', () => {
    expect(vaccineTargetsFor('cat')).toEqual(['panleukopenia', 'calicivirus', 'rhinotracheitis', 'rabies', 'felv', 'chlamydia'])
    const dog = vaccineTargetsFor('dog')
    expect(dog.slice(0, 4)).toEqual(['distemper', 'parvovirus', 'adenovirus', 'rabies'])
    expect(dog).not.toContain('panleukopenia')
  })
})

describe('parasite groups', () => {
  it('switches a whole group: ear mites go with ticks', () => {
    expect(toggleParasiteGroup(['fleas', 'ear_mites'], 'ticks')).toEqual(['fleas'])
    expect(toggleParasiteGroup(['fleas'], 'worms')).toEqual(['fleas', 'worms'])
  })
})

describe('suggested next date', () => {
  it('follows the catalogue interval, weeks as weeks', () => {
    expect(suggestNextDay('2026-09-24', { value: 12, unit: 'week' }, '2026-09-24')).toBe('2026-12-17')
    expect(suggestNextDay('2026-09-24', { value: 1, unit: 'year' }, '2026-09-24')).toBe('2027-09-24')
  })

  it('suggests nothing without an interval, or when the date would already be past', () => {
    expect(suggestNextDay('2026-09-24', null, '2026-09-24')).toBeNull()
    expect(suggestNextDay('2024-03-12', { value: 1, unit: 'year' }, '2026-09-24')).toBeNull()
  })

  it('falls back to a year for a vaccine, three months for worms alone, a month otherwise (phone)', () => {
    expect(fallbackInterval('vaccination', [])).toEqual({ value: 1, unit: 'year' })
    expect(fallbackInterval('parasite', ['worms'])).toEqual({ value: 3, unit: 'month' })
    expect(fallbackInterval('parasite', ['worms', 'fleas'])).toEqual({ value: 1, unit: 'month' })
  })
})

describe('core vaccinations', () => {
  const done = event({ id: uuid(1), status: 'done', date: '2026-03-12', items: [item(uuid(11), ['panleukopenia', 'calicivirus']), item(uuid(12), ['rabies'])] })
  const older = event({ id: uuid(2), status: 'done', date: '2025-03-12', items: [item(uuid(21), ['rabies'])] })
  const plan = event({ id: uuid(3), status: 'planned', date: '2027-03-12', items: [item(uuid(31), ['rabies'], uuid(12))] })
  const parasite = event({ id: uuid(4), kind: 'parasite', status: 'done', date: '2026-06-01', items: [item(uuid(41), ['fleas'])] })

  it('gives each core disease of the species its next plan and its last done day', () => {
    expect(coreVaccinations('cat', [done, older, plan, parasite])).toEqual([
      { target: 'panleukopenia', next: null, last: '2026-03-12' },
      { target: 'calicivirus', next: null, last: '2026-03-12' },
      { target: 'rhinotracheitis', next: null, last: null },
      { target: 'rabies', next: '2027-03-12', last: '2026-03-12' },
    ])
  })

  it('has no dates at all when there are no records, whatever the form says', () => {
    expect(coreVaccinations('dog', []).map((core) => [core.target, core.next, core.last])).toEqual([
      ['distemper', null, null],
      ['parvovirus', null, null],
      ['adenovirus', null, null],
      ['rabies', null, null],
    ])
  })

  it('finds the plan a done item was followed by', () => {
    expect(nextDayOf(uuid(12), [done, plan])).toBe('2027-03-12')
    expect(nextDayOf(uuid(11), [done, plan])).toBeNull()
  })
})
