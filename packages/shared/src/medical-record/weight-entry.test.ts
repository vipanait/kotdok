import { describe, expect, it } from 'vitest'
import { WEIGHT_MAX_KG, WeightInputSchema, WeightPatchSchema, type WeightMeasurement } from '@lapka/contracts'
import {
  WEIGHT_MIN_KG,
  newWeightInput,
  parseWeight,
  weightCorrection,
  weightDayProblem,
  weightFieldText,
  weightPatch,
} from './weight-entry'

const TODAY = '2026-09-26'

function weight(measured_on: string | null, weight_kg: number, source: 'record' | 'form' = 'record'): WeightMeasurement {
  return { id: '00000000-0000-4000-8000-000000000001', measured_on, weight_kg, source }
}

describe('parseWeight', () => {
  it('reads a Russian comma as the decimal point, exactly: «4,2» is the 4.2 the contract takes', () => {
    const parsed = parseWeight('4,2')
    expect(parsed).toEqual({ ok: true, value: 4.2 })
    // The body carries the literal the owner typed, not a float near it.
    expect(JSON.stringify({ weight_kg: parsed.ok && parsed.value })).toBe('{"weight_kg":4.2}')
    expect(parseWeight(' 4.2 ')).toEqual({ ok: true, value: 4.2 })
    expect(parseWeight('0,3')).toEqual({ ok: true, value: 0.3 })
  })

  it('takes the contract’s bounds: above zero, at most the maximum', () => {
    expect(parseWeight(String(WEIGHT_MAX_KG))).toEqual({ ok: true, value: WEIGHT_MAX_KG })
    expect(parseWeight('0,1')).toEqual({ ok: true, value: WEIGHT_MIN_KG })
    for (const text of ['0', '0,0', '-1', '-0,5', '200,1', '201', '1000']) {
      expect(parseWeight(text), text).toEqual({ ok: false, problem: 'invalid' })
    }
  })

  it('says an empty field is empty, and refuses text, two decimals and two separators', () => {
    expect(parseWeight('')).toEqual({ ok: false, problem: 'empty' })
    expect(parseWeight('   ')).toEqual({ ok: false, problem: 'empty' })
    for (const text of ['abc', '4,25', '4..2', '4,2,1', '4,', ',5', '4 кг', '1e2', 'Infinity', 'NaN']) {
      expect(parseWeight(text).ok, text).toBe(false)
    }
  })

  it('accepts only what WeightInputSchema accepts', () => {
    for (const text of ['0,1', '4,2', '199,9', '200']) {
      const parsed = parseWeight(text)
      expect(parsed.ok && WeightInputSchema.safeParse({ measured_on: TODAY, weight_kg: parsed.value }).success, text).toBe(true)
    }
  })
})

describe('weightDayProblem', () => {
  it('refuses a day after the owner’s today, an empty and a malformed one', () => {
    expect(weightDayProblem(TODAY, TODAY)).toBeNull()
    expect(weightDayProblem('2026-01-01', TODAY)).toBeNull()
    expect(weightDayProblem('2026-09-27', TODAY)).toBe('future')
    expect(weightDayProblem('', TODAY)).toBe('empty')
    expect(weightDayProblem('26.09.2026', TODAY)).toBe('invalid')
    expect(weightDayProblem('2026-02-30', TODAY)).toBe('invalid')
  })
})

describe('newWeightInput', () => {
  it('builds the contract’s body from the two fields', () => {
    expect(newWeightInput('4,2', TODAY, TODAY)).toEqual({ ok: true, input: { measured_on: TODAY, weight_kg: 4.2 } })
  })

  it('names what is wrong with each field at once', () => {
    expect(newWeightInput('', '', TODAY)).toEqual({ ok: false, problems: { weight: 'empty', day: 'empty' } })
    expect(newWeightInput('0', '2026-10-01', TODAY)).toEqual({ ok: false, problems: { weight: 'invalid', day: 'future' } })
    expect(newWeightInput('4,2', '2026-10-01', TODAY)).toEqual({ ok: false, problems: { weight: undefined, day: 'future' } })
  })
})

describe('corrections', () => {
  it('sends only what changed, and nothing when nothing did', () => {
    const editing = weight('2026-09-12', 4.2)
    expect(weightPatch(editing, 4.2, '2026-09-12')).toBeNull()
    expect(weightPatch(editing, 4.3, '2026-09-12')).toEqual({ weight_kg: 4.3 })
    expect(weightPatch(editing, 4.2, '2026-09-10')).toEqual({ measured_on: '2026-09-10' })
  })

  it('keeps the form’s undated weight undated when its day is left empty', () => {
    const undated = weight(null, 28, 'form')
    expect(weightCorrection(undated, '27,5', '', TODAY)).toEqual({ ok: true, patch: { weight_kg: 27.5 } })
    expect(weightCorrection(undated, '28', '', TODAY)).toEqual({ ok: true, patch: null })
    expect(weightCorrection(undated, '28', '2026-09-01', TODAY)).toEqual({ ok: true, patch: { measured_on: '2026-09-01' } })
  })

  it('never lets a dated measurement lose its day or move into the future', () => {
    const dated = weight('2026-09-12', 4.2)
    expect(weightCorrection(dated, '4,2', '', TODAY)).toEqual({ ok: false, problems: { weight: undefined, day: 'empty' } })
    expect(weightCorrection(dated, '4,2', '2026-09-30', TODAY)).toEqual({ ok: false, problems: { weight: undefined, day: 'future' } })
    const patch = weightCorrection(dated, '4,1', '2026-09-11', TODAY)
    expect(patch).toEqual({ ok: true, patch: { weight_kg: 4.1, measured_on: '2026-09-11' } })
    expect(patch.ok && WeightPatchSchema.safeParse(patch.patch).success).toBe(true)
  })

  it('shows a stored weight in the field with the locale’s separator', () => {
    expect(weightFieldText(4.2, ',')).toBe('4,2')
    expect(weightFieldText(28, ',')).toBe('28')
    expect(weightFieldText(4.2, '.')).toBe('4.2')
  })
})
