import { describe, expect, it } from 'vitest'
import { PAIN_SIGNS, SYMPTOMS_MAX, SYMPTOMS_MIN } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { emptyCheckForm, formToCheckInput, newIdempotencyKey, toggleSign } from './check-form'

const A_PET = '11111111-1111-4111-8111-000000000001'

/** A form with the pet already chosen, which is now the only valid shape. */
const filled = (patch: Partial<ReturnType<typeof emptyCheckForm>> = {}) => ({
  ...emptyCheckForm(A_PET),
  ...patch,
})

describe('symptom form', () => {
  it('refuses a check with no pet', () => {
    // The contract allows pet_id: null, the product does not — the answer leans
    // on species, age and chronic conditions, and a check is charged either way.
    const result = formToCheckInput(ru, { ...emptyCheckForm(), symptoms: 'вялый второй день' })

    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toContain('питомца')
  })

  it('refuses a description too short to analyse', () => {
    // Not pedantry: the analysis runs anyway and the credit is spent, so the
    // refusal has to happen before the request.
    const result = formToCheckInput(ru, filled({ symptoms: 'ой' }))

    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toContain(String(SYMPTOMS_MIN))
  })

  it('counts what will be sent, not what was typed', () => {
    const result = formToCheckInput(ru, filled({ symptoms: `  ${'а'.repeat(SYMPTOMS_MIN)}  ` }))

    expect(result).toMatchObject({ ok: true, value: { symptoms: 'а'.repeat(SYMPTOMS_MIN) } })
  })

  it('refuses more than the server will store', () => {
    const result = formToCheckInput(ru, filled({ symptoms: 'а'.repeat(SYMPTOMS_MAX + 1) }))

    expect(result).toMatchObject({ ok: false })
  })

  it('sends the quick assessment and the pet it is about', () => {
    const result = formToCheckInput(ru, {
      petId: A_PET,
      symptoms: 'вялый второй день',
      appetite: 'reduced',
      activity: 'low',
      duration: '2-3days',
      stool: 'loose',
      painSigns: ['hiding', 'tense'],
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        pet_id: A_PET,
        appetite: 'reduced',
        activity: 'low',
        duration: '2-3days',
        stool: 'loose',
        pain_signs: ['hiding', 'tense'],
        upload_ids: [],
      },
    })
  })

  it('turns a sign on and off again', () => {
    expect(toggleSign([], 'tense')).toEqual(['tense'])
    expect(toggleSign(['tense', 'hiding'], 'tense')).toEqual(['hiding'])
  })

  it('has wording for every sign the contract allows', () => {
    // A sign added to the contract without a label would render as nothing at
    // all, which is worse than an untranslated word.
    for (const sign of PAIN_SIGNS) {
      expect(ru.pain[sign], sign).toBeTruthy()
    }
  })

  it('makes a key that fits the contract and differs between attempts', () => {
    let counter = 0
    const key = () => newIdempotencyKey(() => `x${(counter += 1)}`)

    const first = key()
    const second = key()

    expect(first.length).toBeGreaterThanOrEqual(8)
    expect(first.length).toBeLessThanOrEqual(200)
    expect(first).not.toBe(second)
  })
})
