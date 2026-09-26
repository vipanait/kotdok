import { describe, expect, it } from 'vitest'
import type { HealthEvent, Medication, VetSummary } from '@lapka/contracts'
import { isTakenNow } from './record-overview'
import {
  cssString,
  fileNameStem,
  summaryNext,
  summaryPetWeight,
  summaryRowsRecorded,
  summaryTaking,
  summaryVisit,
  summaryWeights,
} from './vet-summary'

// MW-07: the rules of «Для врача» the site and the phone share.

const TODAY = '2026-09-26'

function course(overrides: Partial<Medication>): Medication {
  return { id: 'm', name: 'Лечебный корм', dosage: null, started_on: '2026-08-02', ended_on: null, ongoing: true, source: 'record', ...overrides }
}

const pet = (overrides: Partial<VetSummary['pet']> = {}) => ({ medications: [], weight_kg: null, ...overrides }) as unknown as VetSummary['pet']

describe('«Принимает сейчас»', () => {
  it('is a course that has begun and not ended — one that starts later is not taken yet', () => {
    expect(isTakenNow(course({}), TODAY)).toBe(true)
    expect(isTakenNow(course({ started_on: TODAY }), TODAY)).toBe(true)
    // From the pet form: no start known, it is going on.
    expect(isTakenNow(course({ started_on: null }), TODAY)).toBe(true)
    expect(isTakenNow(course({ started_on: '2026-10-01' }), TODAY)).toBe(false)
    expect(isTakenNow(course({ ended_on: TODAY, ongoing: false }), TODAY)).toBe(false)
  })

  it('takes the courses when any are given, the form’s list otherwise, and says nothing was said when both are empty', () => {
    const given = course({ dosage: 'По схеме врача' })
    expect(summaryTaking({ medications: [given], pet: pet({ medications: ['Лечебный корм'] }) })).toEqual({ from: 'courses', courses: [given] })
    expect(summaryTaking({ medications: [], pet: pet({ medications: [' Витамины ', ''] }) })).toEqual({ from: 'form', names: ['Витамины'] })
    expect(summaryTaking({ medications: [], pet: pet() })).toEqual({ from: 'none' })
  })
})

describe('tables', () => {
  it('say overdue for a plan whose day has passed, not for one due today', () => {
    expect(summaryNext('2026-09-12', TODAY)).toEqual({ day: '2026-09-12', overdue: true })
    expect(summaryNext(TODAY, TODAY)).toEqual({ day: TODAY, overdue: false })
    expect(summaryNext(null, TODAY)).toBeNull()
  })

  it('count as recorded only with a date — core diseases listed with nothing are not a record', () => {
    expect(summaryRowsRecorded([{ last_done: null, next: null }])).toBe(false)
    expect(summaryRowsRecorded([{ last_done: null, next: null }, { last_done: null, next: '2026-10-01' }])).toBe(true)
    expect(summaryRowsRecorded([])).toBe(false)
  })
})

describe('the pet’s weight', () => {
  const weights = [
    { id: 'w2', measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' as const },
    { id: 'w0', measured_on: null, weight_kg: 4.3, source: 'form' as const },
    { id: 'w1', measured_on: '2026-03-12', weight_kg: 4.5, source: 'record' as const },
  ]

  it('is the latest weighing with its day, the form’s without one, or nothing said', () => {
    expect(summaryPetWeight({ weights, pet: pet({ weight_kg: 4.2 }) })).toEqual({ from: 'measured', kg: 4.2, day: '2026-09-12' })
    expect(summaryPetWeight({ weights: [], pet: pet({ weight_kg: 28 }) })).toEqual({ from: 'form', kg: 28 })
    expect(summaryPetWeight({ weights: [], pet: pet() })).toEqual({ from: 'none' })
  })

  it('lists dated weighings newest first and charts them oldest first', () => {
    const { latestFirst, chart } = summaryWeights({ weights })
    expect(latestFirst.map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(chart.map((w) => w.id)).toEqual(['w1', 'w2'])
  })
})

describe('a visit', () => {
  const item = (name: string | null, instructions: string | null) => ({
    id: `i-${name}`, name, targets: [], source_item_id: null, product_id: null, interval: null, instructions, medication_id: null,
  })
  const visit = (overrides: Partial<HealthEvent>): HealthEvent => ({
    id: 'v', kind: 'visit', status: 'done', date: '2026-08-02', clinic: null, notes: null, items: [],
    visit_kind: 'illness', reason: null, diagnosis: null, check_id: null, ...overrides,
  })

  it('says its diagnosis, else its reason, and the named prescriptions', () => {
    const line = summaryVisit(
      visit({ reason: 'Рвота', diagnosis: 'Обострение гастрита', items: [item('Фортифлора', '1 пакетик'), item(null, 'x'), item('Корм', ' ')] }),
    )
    expect(line.finding).toBe('Обострение гастрита')
    expect(line.prescriptions).toEqual([
      { name: 'Фортифлора', instructions: '1 пакетик' },
      { name: 'Корм', instructions: null },
    ])
    expect(summaryVisit(visit({ reason: 'Рвота', diagnosis: '  ' })).finding).toBe('Рвота')
    expect(summaryVisit(visit({})).finding).toBeNull()
  })
})

describe('text for files and print', () => {
  it('makes a file name stem without characters a file system refuses', () => {
    expect(fileNameStem('Му/р:ка*?<>|"\\')).toBe('Мурка')
    expect(fileNameStem('../../etc')).toBe('etc')
    expect(fileNameStem('   ')).toBe('')
    expect(fileNameStem('Му‮рка​')).toBe('Мурка')
    expect(fileNameStem(`${'Ж'.repeat(59)}🐱🐱`)).toBe(`${'Ж'.repeat(59)}🐱`)
  })

  it('quotes a CSS string so owner’s text cannot end it', () => {
    expect(cssString('a"b\\c\nd</style>')).toBe('"a\\"b\\\\c d\\3C /style>"')
  })
})
