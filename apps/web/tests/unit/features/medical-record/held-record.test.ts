import { describe, expect, it } from 'vitest'
import { NOTHING_HELD, holdRecord, takeFresh, type HeldState } from '@/features/medical-record/held-record'

type Plan = { id: string; date: string }
const plan: Plan = { id: 'p', date: '2026-10-01' }
const moved: Plan = { id: 'p', date: '2026-10-05' }

function opened(): HeldState<Plan> {
  return holdRecord<Plan>(NOTHING_HELD, { kind: 'open', record: plan }, false).state
}

describe('an edit form over a record refreshed underneath it (MW-09)', () => {
  it('starts from the first load, and a refresh with the same record changes nothing', () => {
    const state = opened()
    expect(state).toEqual({ record: plan, version: 1 })
    const again = holdRecord(state, { kind: 'open', record: { ...plan } }, true)
    expect(again.state).toBe(state)
    expect(again.drift).toBeNull()
  })

  it('never re-initialises a form the owner typed in: it keeps its record and says what changed', () => {
    const state = opened()
    const changed = holdRecord(state, { kind: 'open', record: moved }, true)
    expect(changed.state).toBe(state)
    expect(changed.drift).toBe('changed')
    expect(holdRecord(state, { kind: 'gone' }, true)).toEqual({ state, drift: 'gone' })
    expect(holdRecord(state, { kind: 'closed' }, true)).toEqual({ state, drift: 'closed' })
  })

  it('takes new data into a form nothing was typed in, re-keyed; a deleted or finished record shows its own screen', () => {
    const state = opened()
    expect(holdRecord(state, { kind: 'open', record: moved }, false)).toEqual({ state: { record: moved, version: 2 }, drift: null })
    expect(holdRecord(state, { kind: 'gone' }, false)).toEqual({ state: { record: null, version: 1 }, drift: null })
    expect(holdRecord(state, { kind: 'closed' }, false)).toEqual({ state: { record: null, version: 1 }, drift: null })
  })

  it('drops the edits on request: the latest record, a new key', () => {
    const state = opened()
    expect(takeFresh(state, { kind: 'open', record: moved })).toEqual({ record: moved, version: 2 })
    expect(takeFresh(state, { kind: 'gone' })).toEqual({ record: null, version: 2 })
  })

  it('shows nothing held for a record that is not open at first', () => {
    expect(holdRecord<Plan>(NOTHING_HELD, { kind: 'closed' }, false).state).toBe(NOTHING_HELD)
  })
})
