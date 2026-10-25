import { describe, expect, it } from 'vitest'
import { URGENCY_LEVELS } from '@lapka/contracts'
import {
  DAYS_BETWEEN_ASKS,
  MAX_ASKS,
  afterCheck,
  afterDoseGiven,
  freshState,
  isCalmResult,
  mayAsk,
  readState,
  type ReviewState,
} from './review-rules'

const INSTALLED = '2026-10-01'
const NEXT_DAY = '2026-10-02'

/** A state past its first day that has never asked. */
const settled = (overrides: Partial<ReviewState> = {}): ReviewState => ({
  ...freshState(INSTALLED),
  ...overrides,
})

describe('when the rating sheet may be asked for', () => {
  it('never on the first day, not even at a minute to midnight', () => {
    expect(mayAsk(freshState(INSTALLED), INSTALLED)).toBe(false)
    expect(mayAsk(freshState(INSTALLED), NEXT_DAY)).toBe(true)
  })

  it('not with a clock set back before the first day', () => {
    expect(mayAsk(freshState(INSTALLED), '2026-09-30')).toBe(false)
  })

  it(`waits ${DAYS_BETWEEN_ASKS} days after asking`, () => {
    const state = settled({ asked: 1, lastAskedDay: '2026-10-02' })
    expect(mayAsk(state, '2026-11-30')).toBe(false) // day 59
    expect(mayAsk(state, '2026-12-01')).toBe(true) // day 60
  })

  it('not with a clock set back before the last ask', () => {
    expect(mayAsk(settled({ asked: 1, lastAskedDay: '2026-12-01' }), '2026-11-01')).toBe(false)
  })

  it(`stops for good after ${MAX_ASKS} asks`, () => {
    expect(mayAsk(settled({ asked: MAX_ASKS - 1, lastAskedDay: '2026-01-01' }), '2027-06-01')).toBe(true)
    expect(mayAsk(settled({ asked: MAX_ASKS, lastAskedDay: '2026-01-01' }), '2028-06-01')).toBe(false)
  })
})

describe('after a check', () => {
  it('asks only after good news', () => {
    const calm = URGENCY_LEVELS.filter(isCalmResult)
    expect(calm.sort()).toEqual(['healthy', 'home_care'])
  })

  it('never after an urgent result, and spends nothing on it', () => {
    for (const urgency of ['emergency', 'urgent', 'monitor'] as const) {
      const state = settled()
      expect(afterCheck(state, urgency, NEXT_DAY)).toEqual({ state, ask: false })
    }
  })

  it('asks after a calm result and remembers the day', () => {
    const { state, ask } = afterCheck(settled(), 'healthy', NEXT_DAY)
    expect(ask).toBe(true)
    expect(state).toMatchObject({ asked: 1, lastAskedDay: NEXT_DAY })
  })

  it('a second calm result the same week does not ask again', () => {
    const first = afterCheck(settled(), 'home_care', NEXT_DAY)
    expect(afterCheck(first.state, 'healthy', '2026-10-05').ask).toBe(false)
  })

  it('not on the first day, however calm', () => {
    expect(afterCheck(freshState(INSTALLED), 'healthy', INSTALLED).ask).toBe(false)
  })
})

describe('after «Дали»', () => {
  it('counts the first dose without asking, asks on the second', () => {
    const first = afterDoseGiven(settled(), NEXT_DAY)
    expect(first.ask).toBe(false)
    expect(first.state.dosesGiven).toBe(1)

    const second = afterDoseGiven(first.state, NEXT_DAY)
    expect(second.ask).toBe(true)
    expect(second.state).toMatchObject({ dosesGiven: 2, asked: 1, lastAskedDay: NEXT_DAY })
  })

  it('keeps counting on the first day, and asks on a later dose once it is over', () => {
    let state = freshState(INSTALLED)
    for (let dose = 0; dose < 3; dose++) {
      const decision = afterDoseGiven(state, INSTALLED)
      expect(decision.ask).toBe(false)
      state = decision.state
    }
    expect(state.dosesGiven).toBe(3)
    expect(afterDoseGiven(state, NEXT_DAY).ask).toBe(true)
  })

  it('shares one limit with checks', () => {
    const afterResult = afterCheck(settled({ dosesGiven: 5 }), 'healthy', NEXT_DAY)
    expect(afterDoseGiven(afterResult.state, '2026-10-10').ask).toBe(false)
  })

  it(`asks ${MAX_ASKS} times in all over a long course`, () => {
    let state = settled()
    let asks = 0
    // Two doses a day for three years.
    for (let day = 1; day <= 3 * 365; day++) {
      const today = new Date(Date.UTC(2026, 9, 1 + day)).toISOString().slice(0, 10)
      for (let dose = 0; dose < 2; dose++) {
        const decision = afterDoseGiven(state, today)
        if (decision.ask) asks++
        state = decision.state
      }
    }
    expect(asks).toBe(MAX_ASKS)
  })
})

describe('what is kept on the phone', () => {
  it('starts today when nothing is stored', () => {
    expect(readState(null, INSTALLED)).toEqual(freshState(INSTALLED))
  })

  it('reads back what was written', () => {
    const state = settled({ asked: 2, lastAskedDay: '2026-11-01', dosesGiven: 7 })
    expect(readState(JSON.stringify(state), '2027-01-01')).toEqual(state)
  })

  it('starts over from today on anything it cannot read, so no ask comes early', () => {
    for (const raw of ['', 'not json', 'null', '[]', '{"firstDay":"yesterday","asked":0,"lastAskedDay":null,"dosesGiven":0}', '{"firstDay":"2026-01-01","asked":-1,"lastAskedDay":null,"dosesGiven":0}']) {
      expect(readState(raw, NEXT_DAY)).toEqual(freshState(NEXT_DAY))
    }
  })
})
