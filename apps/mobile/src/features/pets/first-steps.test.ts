import { describe, expect, it } from 'vitest'
import { coreTargets, firstStepsRequests, type FirstStepsDraft } from './first-steps'

const TODAY = '2026-10-20'
const draft = (overrides: Partial<FirstStepsDraft> = {}): FirstStepsDraft => ({
  vaccines: [],
  dates: {},
  lastVisit: null,
  ...overrides,
})

describe('the first steps after the form (FB-2/03, FB-2/04)', () => {
  it('offers the core vaccinations of the species', () => {
    expect(coreTargets('cat')).toEqual(['panleukopenia', 'calicivirus', 'rhinotracheitis', 'rabies'])
    expect(coreTargets('dog')).toEqual(['distemper', 'parvovirus', 'adenovirus', 'rabies'])
  })

  it('puts vaccinations of one day into one record, each with its next date a year on', () => {
    const read = firstStepsRequests(
      draft({ vaccines: ['panleukopenia', 'rabies'], dates: { panleukopenia: '10.03.2026', rabies: '10.03.2026' } }),
      TODAY,
    )
    expect(read).toEqual({
      ok: true,
      events: [
        {
          kind: 'vaccination',
          status: 'done',
          date: '2026-03-10',
          items: [
            { name: null, targets: ['panleukopenia'], next_on: '2027-03-10' },
            { name: null, targets: ['rabies'], next_on: '2027-03-10' },
          ],
        },
      ],
      vaccinatedWithoutDate: false,
      offerCheckup: false,
    })
  })

  it('leaves out the next date once a year has passed, as the vaccination form does', () => {
    const read = firstStepsRequests(draft({ vaccines: ['rabies'], dates: { rabies: '01.09.2025' } }), TODAY)
    expect(read).toMatchObject({ ok: true, events: [{ date: '2025-09-01', items: [{ targets: ['rabies'], next_on: null }] }] })
  })

  it('makes no record of a vaccination without a day, but remembers it was done', () => {
    expect(firstStepsRequests(draft({ vaccines: ['rabies'] }), TODAY)).toMatchObject({
      ok: true,
      events: [],
      vaccinatedWithoutDate: true,
    })
  })

  it('makes nothing of «не помню»', () => {
    expect(firstStepsRequests(draft({ vaccines: ['unknown'] }), TODAY)).toMatchObject({
      ok: true,
      events: [],
      vaccinatedWithoutDate: false,
    })
  })

  it('offers a checkup after «never» or «over a year», not otherwise', () => {
    expect(firstStepsRequests(draft({ lastVisit: 'never' }), TODAY)).toMatchObject({ offerCheckup: true })
    expect(firstStepsRequests(draft({ lastVisit: 'overYear' }), TODAY)).toMatchObject({ offerCheckup: true })
    expect(firstStepsRequests(draft({ lastVisit: 'thisYear' }), TODAY)).toMatchObject({ offerCheckup: false })
    expect(firstStepsRequests(draft({ lastVisit: 'unknown' }), TODAY)).toMatchObject({ offerCheckup: false })
  })

  it('names the vaccination whose day is ahead or not a day', () => {
    expect(firstStepsRequests(draft({ vaccines: ['rabies'], dates: { rabies: '21.10.2026' } }), TODAY)).toEqual({
      ok: false,
      target: 'rabies',
    })
    expect(firstStepsRequests(draft({ vaccines: ['rabies'], dates: { rabies: '31.02.2026' } }), TODAY)).toEqual({
      ok: false,
      target: 'rabies',
    })
  })

  it('gives the same requests for the same answers, so a second «Готово» repeats rather than adds', () => {
    const answers = draft({ vaccines: ['rabies'], dates: { rabies: '10.03.2026' } })
    expect(firstStepsRequests(answers, TODAY)).toEqual(firstStepsRequests(answers, TODAY))
  })
})
