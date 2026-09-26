import { afterEach, describe, expect, it } from 'vitest'
import { recordCache, type RecordData } from '@/features/medical-record/record-load'
import { parseRecordSaved, petFormCancelHref, petFormDoneHref } from '@/features/pets/pet-form-exit'
import { murka } from '../medical-record/demo-overviews'

const PET = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const data: RecordData = { overview: murka, checks: { status: 'ready', items: [] } }

afterEach(() => recordCache.clear())

describe('the way out of the pet form', () => {
  it('returns an edit to the record it was opened from, with the confirmation', () => {
    expect(petFormDoneHref('updated', PET)).toBe(`/pets/${PET}?saved=form`)
    expect(parseRecordSaved('form')).toBe(true)
  })

  it('sends a new pet and a deleted one to the list', () => {
    expect(petFormDoneHref('created')).toBe('/pets?petSaved=created')
    expect(petFormDoneHref('deleted', PET)).toBe('/pets?petSaved=deleted')
  })

  it('cancels back to the record for an existing pet, to the list for a new one', () => {
    expect(petFormCancelHref(PET)).toBe(`/pets/${PET}`)
    expect(petFormCancelHref()).toBe('/pets')
  })

  it('forgets the saved or deleted pet’s record kept in the tab, and only that one', () => {
    recordCache.set(PET, data)
    recordCache.set(OTHER, data)
    petFormDoneHref('updated', PET)
    expect(recordCache.get(PET)).toBeNull()
    expect(recordCache.get(OTHER)).toBe(data)

    recordCache.set(PET, data)
    petFormDoneHref('deleted', PET)
    expect(recordCache.get(PET)).toBeNull()
  })

  it('reads the record’s ?saved= strictly', () => {
    for (const value of [undefined, '', 'added', 'Form', ['form']]) expect(parseRecordSaved(value)).toBe(false)
  })
})
