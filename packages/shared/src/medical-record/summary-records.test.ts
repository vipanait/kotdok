import { describe, expect, it } from 'vitest'
import type { VetSummary } from '@lapka/contracts'
import { summaryRecords } from './summary-records'

const empty = {
  weights: [],
  medications: [],
  vaccinations: [{ target: 'rabies', core: true, last_done: null, product: null, next: null }],
  parasites: [{ group: 'worms', last_done: null, product: null, next: null }],
  visits: [],
} as unknown as VetSummary

describe('what the check can read from a summary (MR-10)', () => {
  it('counts current courses, shots and plans, treatments, visits of the year and dated weights', () => {
    expect(summaryRecords(empty)).toBe(0)
    expect(summaryRecords({ ...empty, vaccinations: [{ target: 'rabies', core: true, last_done: null, product: null, next: '2027-01-01' }] } as VetSummary)).toBe(1)
    expect(summaryRecords({ ...empty, parasites: [{ group: 'worms', last_done: '2026-07-05', product: null, next: null }] } as VetSummary)).toBe(1)
    expect(summaryRecords({ ...empty, weights: [{ id: 'w', measured_on: '2026-09-12', weight_kg: 4, source: 'record' }] } as VetSummary)).toBe(1)
    // The form's undated weight is the form, not the record.
    expect(summaryRecords({ ...empty, weights: [{ id: 'w', measured_on: null, weight_kg: 4, source: 'form' }] } as VetSummary)).toBe(0)
  })
})
