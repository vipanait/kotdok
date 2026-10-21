import { describe, expect, it } from 'vitest'
import { firstStepsRequests, toggleVaccine, vaccineTargets, type FirstStepsDraft } from '@/features/pets/first-steps'

const TODAY = '2026-10-20'
const draft = (overrides: Partial<FirstStepsDraft> = {}): FirstStepsDraft => ({
  vaccines: [],
  dates: {},
  lastVisit: null,
  ...overrides,
})

describe('the optional first steps of a pet added the ordinary way', () => {
  it('a complex vaccination is the core ones of the species but rabies; rabies is its own', () => {
    expect(vaccineTargets('cat', 'complex')).toEqual(['panleukopenia', 'calicivirus', 'rhinotracheitis'])
    expect(vaccineTargets('dog', 'complex')).toEqual(['distemper', 'parvovirus', 'adenovirus'])
    expect(vaccineTargets('cat', 'rabies')).toEqual(['rabies'])
  })

  it('makes a done record of each vaccination with a day, its next date a year on', () => {
    const read = firstStepsRequests(
      draft({ vaccines: ['complex', 'rabies'], dates: { complex: '2025-10-10', rabies: '2026-03-10' } }),
      'cat',
      TODAY,
    )
    expect(read).toEqual({
      ok: true,
      events: [
        {
          kind: 'vaccination',
          status: 'done',
          date: '2025-10-10',
          items: [{ name: null, targets: ['panleukopenia', 'calicivirus', 'rhinotracheitis'], next_on: null }],
        },
        {
          kind: 'vaccination',
          status: 'done',
          date: '2026-03-10',
          items: [{ name: null, targets: ['rabies'], next_on: '2027-03-10' }],
        },
      ],
      vaccinatedWithoutDate: false,
      offerCheckup: false,
    })
  })

  it('puts vaccinations of one day into one record', () => {
    const read = firstStepsRequests(
      draft({ vaccines: ['complex', 'rabies'], dates: { complex: '2026-03-10', rabies: '2026-03-10' } }),
      'dog',
      TODAY,
    )
    expect(read).toMatchObject({
      ok: true,
      events: [
        {
          date: '2026-03-10',
          items: [
            { targets: ['distemper', 'parvovirus', 'adenovirus'], next_on: '2027-03-10' },
            { targets: ['rabies'], next_on: '2027-03-10' },
          ],
        },
      ],
    })
  })

  it('leaves out the next date once a year has passed, as the vaccination form does', () => {
    const read = firstStepsRequests(draft({ vaccines: ['rabies'], dates: { rabies: '2025-09-01' } }), 'cat', TODAY)
    expect(read).toMatchObject({ ok: true, events: [{ date: '2025-09-01', items: [{ next_on: null }] }] })
  })

  it('makes no record of a vaccination without a day, but remembers it was done', () => {
    expect(firstStepsRequests(draft({ vaccines: ['rabies'] }), 'cat', TODAY)).toMatchObject({
      ok: true,
      events: [],
      vaccinatedWithoutDate: true,
    })
  })

  it('makes nothing of «Не помню» and of nothing at all', () => {
    expect(firstStepsRequests(draft({ vaccines: ['unknown'] }), 'cat', TODAY)).toEqual({
      ok: true,
      events: [],
      vaccinatedWithoutDate: false,
      offerCheckup: false,
    })
    expect(firstStepsRequests(draft(), 'cat', TODAY)).toMatchObject({ ok: true, events: [] })
  })

  it('offers a checkup after «Ещё не были» or «Больше года назад», not otherwise', () => {
    expect(firstStepsRequests(draft({ lastVisit: 'never' }), 'cat', TODAY)).toMatchObject({ offerCheckup: true })
    expect(firstStepsRequests(draft({ lastVisit: 'overYear' }), 'cat', TODAY)).toMatchObject({ offerCheckup: true })
    expect(firstStepsRequests(draft({ lastVisit: 'thisYear' }), 'cat', TODAY)).toMatchObject({ offerCheckup: false })
    expect(firstStepsRequests(draft({ lastVisit: 'unknown' }), 'cat', TODAY)).toMatchObject({ offerCheckup: false })
  })

  it('names the vaccination whose day is ahead or not a day', () => {
    expect(firstStepsRequests(draft({ vaccines: ['rabies'], dates: { rabies: '2026-10-21' } }), 'cat', TODAY)).toEqual({
      ok: false,
      choice: 'rabies',
    })
    expect(firstStepsRequests(draft({ vaccines: ['complex'], dates: { complex: '2026-02-31' } }), 'cat', TODAY)).toEqual({
      ok: false,
      choice: 'complex',
    })
  })

  it('accepts today', () => {
    expect(firstStepsRequests(draft({ vaccines: ['rabies'], dates: { rabies: TODAY } }), 'cat', TODAY)).toMatchObject({ ok: true })
  })

  it('gives the same requests for the same answers, so a second «Сохранить» repeats rather than adds', () => {
    const answers = draft({ vaccines: ['rabies'], dates: { rabies: '2026-01-15' } })
    expect(firstStepsRequests(answers, 'cat', TODAY)).toEqual(firstStepsRequests(answers, 'cat', TODAY))
  })
})

describe('the vaccination chips', () => {
  it('«Не помню» clears the others, and any other clears «Не помню»', () => {
    expect(toggleVaccine(['complex', 'rabies'], 'unknown')).toEqual(['unknown'])
    expect(toggleVaccine(['unknown'], 'rabies')).toEqual(['rabies'])
  })

  it('a chip pressed again is taken off', () => {
    expect(toggleVaccine(['complex', 'rabies'], 'complex')).toEqual(['rabies'])
    expect(toggleVaccine(['unknown'], 'unknown')).toEqual([])
  })
})
