import { describe, expect, it } from 'vitest'
import { PAIN_SIGNS, SYMPTOMS_MAX } from '@lapka/contracts'
import { emptyCheckForm, type CheckForm } from './check-form'
import { DRAFT_KEY, isWorthKeeping, parseDraft, serialiseDraft, shouldKeepDraft } from './check-draft'

const ME = 'user-1'
const SOMEONE_ELSE = 'user-2'
const A_PET = '11111111-1111-4111-8111-000000000001'

const typed = () => ({ ...emptyCheckForm(A_PET), symptoms: 'вялый второй день' })

describe('symptom check draft', () => {
  it('comes back the way it went in', () => {
    const draft = { form: { ...typed(), appetite: 'reduced' as const }, step: 2 as const }

    expect(parseDraft(serialiseDraft(ME, draft), ME)).toEqual(draft)
  })

  it('refuses a draft belonging to someone else', () => {
    // A shared phone: the previous person's half-written check is not ours to
    // show, and not ours to send from their balance either.
    const raw = serialiseDraft(SOMEONE_ELSE, { form: typed(), step: 1 })

    expect(parseDraft(raw, ME)).toBeNull()
  })

  it('keeps nothing when nothing was typed', () => {
    // The pet is preselected on open, so its presence is not evidence of work.
    expect(isWorthKeeping(emptyCheckForm(A_PET))).toBe(false)
    expect(parseDraft(serialiseDraft(ME, { form: emptyCheckForm(A_PET), step: 1 }), ME)).toBeNull()
  })

  it('survives rubbish instead of crashing on it', () => {
    for (const raw of [null, '', 'not json', '[]', '"text"', '{}', '{"userId":"user-1"}']) {
      expect(parseDraft(raw, ME), String(raw)).toBeNull()
    }
  })

  it('drops values the contract no longer knows', () => {
    // An upgrade can rename an option; a stale draft must not smuggle it back.
    const raw = JSON.stringify({
      userId: ME,
      step: 1,
      form: { ...typed(), appetite: 'ravenous', painSigns: ['tense', 'levitating'] },
    })

    expect(parseDraft(raw, ME)).toMatchObject({
      form: { appetite: null, painSigns: ['tense'] },
    })
  })

  it('holds every pain sign the contract allows', () => {
    const raw = serialiseDraft(ME, { form: { ...typed(), painSigns: [...PAIN_SIGNS] }, step: 1 })

    expect(parseDraft(raw, ME)?.form.painSigns).toEqual([...PAIN_SIGNS])
  })

  it('trims a description longer than the server will take', () => {
    const raw = JSON.stringify({
      userId: ME,
      step: 1,
      form: { ...typed(), symptoms: 'а'.repeat(SYMPTOMS_MAX + 100) },
    })

    expect(parseDraft(raw, ME)?.form.symptoms).toHaveLength(SYMPTOMS_MAX)
  })

  it('will not restore step two with nothing to summarise', () => {
    // Step two shows a card of what step one captured; empty, its only way out
    // is the "Изменить" link back.
    const raw = JSON.stringify({
      userId: ME,
      step: 2,
      form: { ...emptyCheckForm(A_PET), appetite: 'reduced' },
    })

    expect(parseDraft(raw, ME)?.step).toBe(1)
  })

  it('uses one key, so a second draft cannot outlive the first', () => {
    expect(DRAFT_KEY).toBe('lapka.check-draft')
  })
})

describe('whether a draft survives leaving the screen', () => {
  const written: CheckForm = { ...emptyCheckForm(), symptoms: 'вялый второй день' }

  it('keeps what was typed but not sent', () => {
    expect(shouldKeepDraft({ sent: false, form: written })).toBe(true)
  })

  it('drops it once the check has been accepted', () => {
    // The defect this pins: the draft is deleted on submit and was then saved
    // again on the way out, so the next check opened on the previous answers —
    // and reused its idempotency key, which the server answers with the
    // previous result.
    expect(shouldKeepDraft({ sent: true, form: written })).toBe(false)
  })

  it('drops an empty form either way', () => {
    expect(shouldKeepDraft({ sent: false, form: emptyCheckForm() })).toBe(false)
    expect(shouldKeepDraft({ sent: true, form: emptyCheckForm() })).toBe(false)
  })
})
