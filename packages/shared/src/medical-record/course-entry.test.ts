import { describe, expect, it } from 'vitest'
import { MedicationPatchSchema, type Medication } from '@lapka/contracts'
import { canEndCourse, courseDayProblems, courseEditable, endCoursePatch } from './course-entry'
import { splitCourses } from './record-overview'

// MW-05: the course rules the site and the phone share. A finished course is
// only read; «Завершить курс» ends a begun course on the owner's today and it
// moves from «Сейчас» to «Раньше» at once.

const TODAY = '2026-09-26'

function course(overrides: Partial<Medication>): Medication {
  return { id: 'm', name: 'Лечебный корм', dosage: null, started_on: '2026-08-02', ended_on: null, ongoing: false, source: 'record', ...overrides }
}

describe('which course can change', () => {
  it('a current course — no end, or an end after today — can; one that ended today or earlier cannot', () => {
    expect(courseEditable(course({ ongoing: true }), TODAY)).toBe(true)
    expect(courseEditable(course({ ended_on: '2026-09-27' }), TODAY)).toBe(true)
    expect(courseEditable(course({ ended_on: TODAY }), TODAY)).toBe(false)
    expect(courseEditable(course({ ended_on: '2026-08-15' }), TODAY)).toBe(false)
  })

  it('offers «Завершить курс» on a begun current course only', () => {
    expect(canEndCourse(course({ ongoing: true }), TODAY)).toBe(true)
    expect(canEndCourse(course({ started_on: TODAY }), TODAY)).toBe(true)
    // From the pet form: no start known, it is going on.
    expect(canEndCourse(course({ started_on: null }), TODAY)).toBe(true)
    // Starts later: corrected or deleted, not ended.
    expect(canEndCourse(course({ started_on: '2026-10-01' }), TODAY)).toBe(false)
    expect(canEndCourse(course({ ended_on: TODAY }), TODAY)).toBe(false)
  })

  it('ends a course on the owner’s today, which the contract accepts, and moves it to the past', () => {
    const patch = endCoursePatch(TODAY)
    expect(patch).toEqual({ ended_on: TODAY, ongoing: false })
    expect(MedicationPatchSchema.safeParse(patch).success).toBe(true)
    const ended = { ...course({ ongoing: true }), ...patch }
    const { current, past } = splitCourses([ended], TODAY)
    expect(current).toEqual([])
    expect(past.map((c) => c.id)).toEqual(['m'])
  })
})

describe('a course’s dates as typed', () => {
  it('needs a start unless the course never had one', () => {
    expect(courseDayProblems({ start: '', end: '', ongoing: false })).toEqual({ start: 'empty' })
    expect(courseDayProblems({ start: '', end: '', ongoing: false }, true)).toEqual({})
    expect(courseDayProblems({ start: '2026-02-30', end: '', ongoing: false })).toEqual({ start: 'invalid' })
    expect(courseDayProblems({ start: '24.09', end: '', ongoing: false })).toEqual({ start: 'invalid' })
  })

  it('refuses an end before the start; the same day is a one-day course', () => {
    expect(courseDayProblems({ start: '2026-09-24', end: '2026-09-23', ongoing: false })).toEqual({ end: 'beforeStart' })
    expect(courseDayProblems({ start: '2026-09-24', end: '2026-09-24', ongoing: false })).toEqual({})
    expect(courseDayProblems({ start: '2026-09-24', end: '2026-10-01', ongoing: false })).toEqual({})
    expect(courseDayProblems({ start: '2026-09-24', end: '2026-13-01', ongoing: false })).toEqual({ end: 'invalid' })
  })

  it('does not read the end of a course taken «Постоянно»', () => {
    expect(courseDayProblems({ start: '2026-09-24', end: '2026-09-01', ongoing: true })).toEqual({})
    expect(courseDayProblems({ start: '2026-09-24', end: 'nonsense', ongoing: true })).toEqual({})
  })

  it('checks an end without a known start only for being a day', () => {
    expect(courseDayProblems({ start: '', end: '2026-09-01', ongoing: false }, true)).toEqual({})
    // An unreadable start does not make up a range problem on top.
    expect(courseDayProblems({ start: 'x', end: '2026-09-01', ongoing: false })).toEqual({ start: 'invalid' })
  })
})
