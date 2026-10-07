import { describe, expect, it } from 'vitest'
import { MEDICATION_LIMITS, type Medication } from '@lapka/contracts'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { ApiError, isCurrentCourse as isCurrent, splitCourses } from '@lapka/shared'
import { blankCourse, canAddCourse, courseDates, courseEndsByToday, endCourse, readCourses } from './medications'

const TODAY = '2026-09-24'
const NOW = new Date(2026, 8, 24, 12, 0)

function course(overrides: Partial<Medication>): Medication {
  return { id: 'm', name: 'Лечебный корм', dosage: null, started_on: null, ended_on: null, ongoing: false, source: 'record', ...overrides }
}

describe('when a course is current', () => {
  it('is current with no end or an end after today; done on its last day', () => {
    expect(isCurrent(course({}), TODAY)).toBe(true)
    expect(isCurrent(course({ ended_on: '2026-09-25' }), TODAY)).toBe(true)
    expect(isCurrent(course({ ended_on: TODAY }), TODAY)).toBe(false)
  })

  it('splits into «Сейчас» and «Раньше», latest first', () => {
    const { current, past } = splitCourses(
      [course({ id: 'a', ended_on: '2026-08-15', started_on: '2026-08-02' }), course({ id: 'b', started_on: '2026-08-02', ongoing: true })],
      TODAY,
    )
    expect(current.map((c) => c.id)).toEqual(['b'])
    expect(past.map((c) => c.id)).toEqual(['a'])
  })
})

describe('the dates of a course (MR-06.4)', () => {
  it('reads each kind of course differently', () => {
    expect(courseDates(ru, course({ started_on: '2026-08-02', ongoing: true }), TODAY)).toBe('с 2 августа · постоянно')
    expect(courseDates(ru, course({ started_on: '2026-08-02', ended_on: '2026-08-15' }), TODAY)).toBe('2–15 августа')
    expect(courseDates(ru, course({ started_on: '2026-07-28', ended_on: '2026-08-15' }), TODAY)).toBe('28 июля – 15 августа')
    expect(courseDates(ru, course({ started_on: '2025-12-20', ended_on: '2026-01-10' }), TODAY)).toBe('20 декабря 2025 – 10 января 2026')
    expect(courseDates(ru, course({ started_on: '2026-08-02' }), TODAY)).toBe('с 2 августа')
    expect(courseDates(ru, course({ source: 'form' }), TODAY)).toBe('Из анкеты — добавьте дозировку и даты')
    // Ended on the day it started (MW-05: «Завершить курс» on a course begun today).
    expect(courseDates(ru, course({ started_on: TODAY, ended_on: TODAY }), TODAY)).toBe('24 сентября')
  })

  it('puts the month where English puts it', () => {
    // Was «2–August 15»: the Russian order with English words.
    expect(courseDates(en, course({ started_on: '2026-08-02', ended_on: '2026-08-15' }), TODAY)).toBe('August 2–15')
    expect(courseDates(en, course({ started_on: '2026-07-28', ended_on: '2026-08-15' }), TODAY)).toBe('July 28 – August 15')
  })
})

describe('the course form', () => {
  it('builds several courses, today by default', () => {
    const read = readCourses(ru, [
      { ...blankCourse('a', NOW), name: 'Фортифлора', dosage: '1 пакетик в день', end: '07.10.2026' },
      { ...blankCourse('b', NOW), name: 'Лечебный корм', ongoing: true },
    ])
    expect(read.ok && read.value).toEqual([
      { name: 'Фортифлора', dosage: '1 пакетик в день', started_on: '2026-09-24', ended_on: '2026-10-07', ongoing: false },
      { name: 'Лечебный корм', dosage: null, started_on: '2026-09-24', ended_on: null, ongoing: true },
    ])
  })

  it('refuses no name, a bad date and an end before the start (MR-06.4)', () => {
    const read = readCourses(ru, [
      { ...blankCourse('a', NOW) },
      { ...blankCourse('b', NOW), name: 'x', start: '31.02.2026' },
      { ...blankCourse('c', NOW), name: 'y', end: '01.09.2026' },
    ])
    expect(!read.ok && read.errors).toEqual({
      a: { name: 'Введите название' },
      b: { start: 'Дата — ДД.ММ.ГГГГ' },
      c: { end: 'Окончание — не раньше начала' },
    })
  })

  it('needs a start for a new course, as the site (spec §7.12)', () => {
    const read = readCourses(ru, [{ ...blankCourse('a', NOW), name: 'x', start: '' }])
    expect(!read.ok && read.errors).toEqual({ a: { start: 'Укажите начало курса' } })
  })

  it('lets a course from the pet form with no start keep it empty', () => {
    const read = readCourses(ru, [{ ...blankCourse('a', NOW), name: 'x', start: '' }], true)
    expect(read.ok && read.value[0].started_on).toBeNull()
    // A start typed wrong is still wrong.
    const wrong = readCourses(ru, [{ ...blankCourse('a', NOW), name: 'x', start: '31.02.2026' }], true)
    expect(!wrong.ok && wrong.errors).toEqual({ a: { start: 'Дата — ДД.ММ.ГГГГ' } })
  })

  it('says the contract’s limits in its errors', () => {
    const read = readCourses(ru, [
      { ...blankCourse('a', NOW), name: 'Ф'.repeat(MEDICATION_LIMITS.name + 1), dosage: 'x'.repeat(MEDICATION_LIMITS.dosage + 1) },
    ])
    expect(!read.ok && read.errors).toEqual({
      a: { name: `Не длиннее ${MEDICATION_LIMITS.name} символов`, dosage: `Не длиннее ${MEDICATION_LIMITS.dosage} символов` },
    })
    expect(readCourses(ru, [{ ...blankCourse('a', NOW), name: 'Ф'.repeat(MEDICATION_LIMITS.name) }]).ok).toBe(true)
  })

  it('warns that a course ending today or earlier is saved finished', () => {
    expect(courseEndsByToday({ ...blankCourse('a', NOW), end: '24.09.2026' }, TODAY)).toBe(true)
    expect(courseEndsByToday({ ...blankCourse('a', NOW), end: '01.09.2026' }, TODAY)).toBe(true)
    expect(courseEndsByToday({ ...blankCourse('a', NOW), end: '25.09.2026' }, TODAY)).toBe(false)
    expect(courseEndsByToday({ ...blankCourse('a', NOW), end: '' }, TODAY)).toBe(false)
    // Not a day yet: nothing to warn about, the error comes on saving.
    expect(courseEndsByToday({ ...blankCourse('a', NOW), end: '24.09' }, TODAY)).toBe(false)
    expect(courseEndsByToday({ ...blankCourse('a', NOW), end: '24.09.2026', ongoing: true }, TODAY)).toBe(false)
  })

  it('adds courses up to what one save takes', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => blankCourse(`k${i}`, NOW))
    expect(canAddCourse(many(MEDICATION_LIMITS.items - 1))).toBe(true)
    expect(canAddCourse(many(MEDICATION_LIMITS.items))).toBe(false)
  })
})

/**
 * The server's PATCH of a course, in miniature (medication-service
 * `changeMedication`): a finished course — ended on the owner's day or
 * earlier — answers 200 to a patch that changes nothing and 409 record_done
 * to any other; a current one takes the patch. `lose` drops the next answer
 * after the change is made, as a dropped connection does.
 */
function courseServer(start: Medication) {
  let stored = start
  let lose = false
  const sent: Array<{ ended_on: string | null | undefined; today: string }> = []
  return {
    sent,
    stored: () => stored,
    loseNextAnswer: () => void (lose = true),
    send: async (patch: { ended_on?: string | null; ongoing?: boolean }, today: string): Promise<Medication> => {
      sent.push({ ended_on: patch.ended_on, today })
      const finished = stored.ended_on !== null && stored.ended_on <= today
      const changes = (patch.ended_on ?? null) !== stored.ended_on || (patch.ongoing ?? false) !== stored.ongoing
      if (finished && changes) throw new ApiError('record_done', 409, 'A finished course is not changed')
      stored = { ...stored, ...patch } as Medication
      if (lose) {
        lose = false
        throw new TypeError('Network request failed')
      }
      return stored
    },
  }
}

describe('«Завершить курс» sent again after a lost answer (MW-09 final review)', () => {
  const current = course({ id: 'c', started_on: '2026-09-01', ongoing: true })

  it('the first try landed before midnight, the retry after it: the same end is sent, and the answer is the course', async () => {
    const server = courseServer(current)
    const attempt = { day: null as string | null }
    server.loseNextAnswer()
    await expect(endCourse(server.send, attempt, '2026-09-24')).rejects.toThrow('Network request failed')
    expect(server.stored().ended_on).toBe('2026-09-24')
    // Past midnight: the screen's today is the 25th, the end is still the 24th.
    const retry = await endCourse(server.send, attempt, '2026-09-25')
    expect(retry).toEqual({ kind: 'ended', course: expect.objectContaining({ ended_on: '2026-09-24', ongoing: false }) })
    expect(server.sent).toEqual([
      { ended_on: '2026-09-24', today: '2026-09-24' },
      { ended_on: '2026-09-24', today: '2026-09-25' },
    ])
    // Answered: the next «Завершить курс» is a new one.
    expect(attempt.day).toBeNull()
  })

  it('a first try that never reached the server: the retry after midnight ends the course on the day it was pressed', async () => {
    const server = courseServer(current)
    const attempt = { day: null as string | null }
    const offline = async () => {
      throw new TypeError('Network request failed')
    }
    await expect(endCourse(offline, attempt, '2026-09-24')).rejects.toThrow()
    expect((await endCourse(server.send, attempt, '2026-09-25')).kind).toBe('ended')
    expect(server.stored().ended_on).toBe('2026-09-24')
  })

  it('a course finished meanwhile on another device (record_done): read again, not an error', async () => {
    const server = courseServer(course({ id: 'c', started_on: '2026-09-01', ended_on: '2026-09-20' }))
    const attempt = { day: null as string | null }
    expect(await endCourse(server.send, attempt, '2026-09-24')).toEqual({ kind: 'reread' })
    expect(attempt.day).toBeNull()
  })

  it('another refusal is the screen’s to say, and the server has answered it: the next press starts over', async () => {
    const attempt = { day: null as string | null }
    const refusing = async () => {
      throw new ApiError('bad_request', 400, 'bad')
    }
    await expect(endCourse(refusing, attempt, '2026-09-24')).rejects.toBeInstanceOf(ApiError)
    expect(attempt.day).toBeNull()
  })
})
