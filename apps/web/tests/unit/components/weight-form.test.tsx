import { describe, expect, it, vi } from 'vitest'
import type { WeightMeasurement } from '@lapka/contracts'
import { ApiError, ApiTimeoutError } from '@lapka/shared'
import ru from '@/shared/i18n/dictionaries/ru'
import WeightForm from '@/features/medical-record/weight/WeightForm'
import { saveFailure, weightFailureView, weightSaveStep } from '@/features/medical-record/weight/weight-form'
import { render, tag, tags } from './static-render'

// The weight form (MW-02, MW-09): what it draws for a new weighing, for the
// pet form's weight being dated, and for a correction; and what «Сохранить»
// does with the fields, before and after the request.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const TODAY = '2026-09-27'
const PET = '11111111-1111-4111-8111-000000000001'
const words = ru.medicalRecord.weightForm

const measured: WeightMeasurement = { id: '22222222-2222-4222-8222-000000000001', measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' }
const undated: WeightMeasurement = { ...measured, measured_on: null, source: 'form' }

const field = (html: string, type: string) => tag(html, 'input', (input) => input.attrs.type === type)

describe('the weight form as drawn', () => {
  it('a new weighing: empty weight, today, no later day, both fields required, no delete', () => {
    const html = render(<WeightForm petId={PET} petName="Мурка" editing={null} today={TODAY} />)
    const weight = field(html, 'text')
    const day = field(html, 'date')
    expect(tags(html, 'h1').map((h) => h.text)).toEqual([words.addTitle])
    expect(weight.attrs.value).toBe('')
    expect(weight.attrs.inputmode).toBe('decimal')
    expect(weight.attrs['aria-required']).toBe('true')
    expect(day.attrs.value).toBe(TODAY)
    expect(day.attrs.max).toBe(TODAY)
    expect(day.attrs['aria-required']).toBe('true')
    // The hint is the field's description; no error is said before a save.
    const hint = tag(html, 'span', (span) => span.attrs.id === day.attrs['aria-describedby'])
    expect(hint.text).toBe(words.newHint)
    expect(tags(html, 'span').some((span) => span.attrs.role === 'alert')).toBe(false)
    // The save button is a real submit that is never `disabled` (it keeps focus while saving).
    const submit = tag(html, 'button', (button) => button.attrs.type === 'submit')
    expect(submit.text).toBe(words.save)
    expect('disabled' in submit.attrs).toBe(false)
    expect(tags(html, 'button').some((button) => button.text === words.delete)).toBe(false)
  })

  it('the pet form’s weight to be dated: its value with both decimals, an empty day', () => {
    const html = render(<WeightForm petId={PET} petName="Мурка" editing={null} today={TODAY} formWeight={4.25} />)
    expect(field(html, 'text').attrs.value).toBe('4,25')
    expect(field(html, 'date').attrs.value).toBe('')
    expect(html).toContain(words.datingHint)
  })

  it('a correction: its value and day, and the delete button', () => {
    const html = render(<WeightForm petId={PET} petName="Мурка" editing={measured} today={TODAY} />)
    expect(tags(html, 'h1').map((h) => h.text)).toEqual([words.editTitle])
    expect(field(html, 'text').attrs.value).toBe('4,2')
    expect(field(html, 'date').attrs.value).toBe('2026-09-12')
    expect(html).toContain(words.editHint)
    expect(tag(html, 'button', (button) => button.text === words.delete).attrs.type).toBe('button')
  })

  it('an undated correction: the day may stay empty — not required, and says so', () => {
    const html = render(<WeightForm petId={PET} petName="Мурка" editing={undated} today={TODAY} />)
    const day = field(html, 'date')
    expect(day.attrs.value).toBe('')
    expect(day.attrs['aria-required']).toBeUndefined()
    expect(html).toContain(words.undatedHint)
  })

  it('in English: the same form in the site’s other language', () => {
    const html = render(<WeightForm petId={PET} petName="Murka" editing={null} today={TODAY} />, 'en')
    expect(tag(html, 'button', (button) => button.attrs.type === 'submit').text).toBe('Save')
  })
})

describe('«Сохранить» with the fields as they stand', () => {
  const step = (fields: Partial<Parameters<typeof weightSaveStep>[1]>) =>
    weightSaveStep(ru, { editing: null, weightText: '', day: TODAY, today: TODAY, formWeight: null, ...fields })

  it('refuses empty or impossible values and moves to the weight first, else the day', () => {
    const empty = step({ weightText: '', day: '' })
    expect(empty).toMatchObject({ step: 'invalid', focus: 'weight' })
    if (empty.step === 'invalid') expect(empty.errors).toEqual({ weight: words.errors.weightEmpty, day: words.errors.dayEmpty })
    expect(step({ weightText: '4,2', day: '2026-09-28' })).toMatchObject({ step: 'invalid', focus: 'day', errors: { day: words.errors.dayFuture } })
    expect(step({ weightText: '4,25' })).toMatchObject({ step: 'invalid', focus: 'weight' })
  })

  it('adds a new weighing, and dates the pet form’s 4,25 without rounding it', () => {
    expect(step({ weightText: '4,2' })).toEqual({ step: 'add', input: { measured_on: TODAY, weight_kg: 4.2 } })
    expect(step({ weightText: '4,25', day: '2026-09-01', formWeight: 4.25 })).toEqual({
      step: 'add',
      input: { measured_on: '2026-09-01', weight_kg: 4.25 },
    })
  })

  it('goes back with nothing to send when a correction changes nothing, and sends only what changed', () => {
    expect(step({ editing: measured, weightText: '4,2', day: '2026-09-12' })).toEqual({ step: 'unchanged' })
    expect(step({ editing: measured, weightText: '4,3', day: '2026-09-12' })).toEqual({ step: 'change', patch: { weight_kg: 4.3 } })
  })
})

describe('a save that failed keeps the fields and says why', () => {
  it('a taken day at the date field; the account being deleted leaves the cabinet', () => {
    expect(weightFailureView(ru, saveFailure(new ApiError('conflict', 409, 'taken')))).toEqual({ dayError: words.errors.dayTaken })
    expect(weightFailureView(ru, saveFailure(new ApiError('account_deleting', 403, 'deleting')))).toEqual({ leave: '/account-deletion' })
  })

  it('no connection, a timeout and the rest in the banner — the form stays as typed', () => {
    expect(weightFailureView(ru, saveFailure(new TypeError('fetch failed')))).toEqual({ banner: words.errors.offline })
    expect(weightFailureView(ru, saveFailure(new ApiTimeoutError('/pets/x/health/weights', 15000)))).toEqual({ banner: words.errors.offline })
    expect(weightFailureView(ru, saveFailure(new ApiError('internal_error', 500, 'boom')))).toEqual({ banner: words.errors.failed })
  })
})
