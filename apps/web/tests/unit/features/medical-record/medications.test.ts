import { describe, expect, it } from 'vitest'
import { MEDICATION_LIMITS, type Medication } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import {
  blankCourse,
  coursesChanged,
  draftFromCourse,
  endsByToday,
  readCourseChange,
  readNewCourses,
  type CourseDraft,
} from '@/features/medical-record/medications/course-form'
import { courseErrorTexts } from '@/features/medical-record/medications/course-form-text'
import { coursePeriod, courseRecord, coursesPage, parseCourseSaved } from '@/features/medical-record/medications/course-view'
import { eventSaveFailure } from '@/features/medical-record/events/event-form'
import { importantFacts, sectionCards } from '@/features/medical-record/view-model'
import { bobik, murka } from './demo-overviews'

// MW-05: medicines and courses, as data — the form, the section, one course.

const TODAY = '2026-09-26'
const petId = murka.pet.id
const food = murka.medications[0] // ongoing since 2 August
const fortiflora = murka.medications[1] // 2–15 August, finished

function course(overrides: Partial<Medication>): Medication {
  return { id: '00000000-0000-4000-8000-000000000499', name: 'Апоквел', dosage: null, started_on: '2026-09-20', ended_on: null, ongoing: false, source: 'record', ...overrides }
}

const draft = (key: string, fields: Partial<CourseDraft>): CourseDraft => ({ ...blankCourse(key, TODAY), ...fields })

describe('the new medicines form', () => {
  it('starts with one empty course from today', () => {
    expect(blankCourse('a', TODAY)).toEqual({ key: 'a', name: '', dosage: '', start: TODAY, end: '', ongoing: false })
  })

  it('sends several courses in one request: a course with an end and one «Постоянно»', () => {
    const read = readNewCourses([
      draft('a', { name: ' Фортифлора ', dosage: '1 пакетик в день', end: '2026-10-09' }),
      draft('b', { name: 'Лечебный корм', dosage: '  ', ongoing: true }),
    ])
    expect(read).toEqual({
      ok: true,
      value: {
        items: [
          { name: 'Фортифлора', dosage: '1 пакетик в день', started_on: TODAY, ended_on: '2026-10-09', ongoing: false },
          { name: 'Лечебный корм', dosage: null, started_on: TODAY, ended_on: null, ongoing: true },
        ],
      },
    })
  })

  it('does not send the end of a course ticked «Постоянно», even one typed before', () => {
    const read = readNewCourses([draft('a', { name: 'Лечебный корм', end: '2026-09-01', ongoing: true })])
    expect(read.ok && read.value.items[0]).toMatchObject({ ended_on: null, ongoing: true })
  })

  it('blocks an end before the start, per course, and sends nothing', () => {
    const read = readNewCourses([
      draft('a', { name: 'Фортифлора', end: '2026-10-09' }),
      draft('b', { name: 'Апоквел', start: '2026-09-26', end: '2026-09-25' }),
    ])
    expect(read).toEqual({ ok: false, problems: { course: { b: { end: 'beforeStart' } } } })
    expect(courseErrorTexts(ru, read.ok ? {} : read.problems).course.b.end).toBe('Окончание не может быть раньше начала')
  })

  it('needs a name and a start; the texts are the contract’s 150', () => {
    const long = 'x'.repeat(MEDICATION_LIMITS.name + 1)
    const read = readNewCourses([draft('a', { start: '' }), draft('b', { name: long, dosage: long })])
    expect(read).toEqual({
      ok: false,
      problems: { course: { a: { name: 'empty', start: 'empty' }, b: { name: 'tooLong', dosage: 'tooLong' } } },
    })
    const texts = courseErrorTexts(ru, read.ok ? {} : read.problems)
    expect(texts.course.a).toEqual({ name: 'Введите название', start: 'Укажите начало курса', dosage: undefined, end: undefined })
    expect(texts.course.b.name).toBe('Название — не длиннее 150 символов')
  })

  it('takes up to ten courses in one save', () => {
    const ten = Array.from({ length: MEDICATION_LIMITS.items }, (_, n) => draft(`k${n}`, { name: `Препарат ${n}` }))
    expect(readNewCourses(ten).ok).toBe(true)
    expect(readNewCourses([...ten, draft('k10', { name: 'Ещё' })])).toEqual({ ok: false, problems: { items: 'tooMany' } })
    expect(readNewCourses([])).toEqual({ ok: false, problems: { items: 'none' } })
  })

  it('says a course that ends by today will be saved finished', () => {
    expect(endsByToday(draft('a', { end: TODAY }), TODAY)).toBe(true)
    expect(endsByToday(draft('a', { end: '2026-09-27' }), TODAY)).toBe(false)
    expect(endsByToday(draft('a', { end: TODAY, ongoing: true }), TODAY)).toBe(false)
  })

  it('knows when leaving would lose something', () => {
    const initial = [blankCourse('a', TODAY)]
    expect(coursesChanged(initial, initial)).toBe(false)
    expect(coursesChanged(initial, [draft('a', { name: 'x' })])).toBe(true)
    expect(coursesChanged(initial, [...initial, blankCourse('b', TODAY)])).toBe(true)
  })
})

describe('correcting a current course', () => {
  it('opens with the course’s own values and sends only what changed', () => {
    const opened = draftFromCourse(food)
    expect(opened).toEqual({ key: food.id, name: 'Лечебный корм', dosage: '', start: '2026-08-02', end: '', ongoing: true })
    expect(readCourseChange(food, opened)).toEqual({ ok: true, value: null })
    expect(readCourseChange(food, { ...opened, dosage: 'По схеме врача' })).toEqual({ ok: true, value: { dosage: 'По схеме врача' } })
  })

  it('unticking «Постоянно» with an end sends both; ticking it clears the end', () => {
    const withEnd = course({ ended_on: '2026-10-20' })
    expect(readCourseChange(food, { ...draftFromCourse(food), ongoing: false, end: '2026-10-01' })).toEqual({
      ok: true,
      value: { ended_on: '2026-10-01', ongoing: false },
    })
    expect(readCourseChange(withEnd, { ...draftFromCourse(withEnd), ongoing: true })).toEqual({
      ok: true,
      value: { ended_on: null, ongoing: true },
    })
  })

  it('keeps an unknown start of a course from the pet form unknown, and refuses an end before a start', () => {
    const fromForm = course({ started_on: null, source: 'form' })
    expect(readCourseChange(fromForm, { ...draftFromCourse(fromForm), dosage: '1 таблетка' })).toEqual({ ok: true, value: { dosage: '1 таблетка' } })
    const read = readCourseChange(food, { ...draftFromCourse(food), ongoing: false, end: '2026-08-01' })
    expect(read).toEqual({ ok: false, problems: { course: { [food.id]: { end: 'beforeStart' } } } })
  })
})

describe('the medicines section', () => {
  it('lists current courses, then finished ones, with the numbers of the design', () => {
    const view = coursesPage(ru, murka, TODAY)
    expect(view.subtitle).toBe('Мурка · Сейчас: 1 · Всего: 2')
    expect(view.current.map((c) => [c.title, c.period])).toEqual([['Лечебный корм', 'С 2 августа · постоянно']])
    expect(view.past.map((c) => [c.title, c.dosage, c.period])).toEqual([['Фортифлора', '1 пакетик в день', '2–15 августа']])
    expect(view.past[0].href).toBe(`/pets/${petId}/health/${fortiflora.id}`)
    expect(view.past[0].label).toBe('Фортифлора: 1 пакетик в день, 2–15 августа')
    expect(view.empty).toBeNull()
  })

  it('is empty without courses, naming what the pet form lists if anything', () => {
    expect(coursesPage(ru, bobik, TODAY).empty).toEqual({ title: 'Лекарств нет', body: 'Если врач назначит курс — сохраните его здесь.', formNames: null })
    const listed = { ...bobik, pet: { ...bobik.pet, medications: ['Апоквел'] } }
    expect(coursesPage(ru, listed, TODAY).empty?.formNames).toBe('Апоквел')
  })

  it('says each kind of period, and makes up no date', () => {
    expect(coursePeriod(ru, course({ started_on: '2026-08-02', ongoing: true }), TODAY)).toBe('С 2 августа · постоянно')
    expect(coursePeriod(ru, course({ started_on: '2026-08-02' }), TODAY)).toBe('С 2 августа')
    expect(coursePeriod(ru, course({ started_on: '2026-10-03' }), TODAY)).toBe('Начнётся 3 октября')
    expect(coursePeriod(ru, course({ started_on: '2025-12-20', ended_on: '2026-01-10' }), TODAY)).toBe('20 декабря 2025 – 10 января 2026')
    expect(coursePeriod(ru, course({ started_on: null, source: 'form' }), TODAY)).toBe('Из анкеты — дозировка и даты не указаны')
    expect(coursePeriod(ru, course({ started_on: null, ongoing: true }), TODAY)).toBe('Постоянно')
    expect(coursePeriod(en, course({ started_on: '2026-08-02', ongoing: true }), TODAY)).toBe('Since August 2 · ongoing')
  })

  it('stays one list with «Принимает сейчас» and the record’s card: a course ended today leaves both', () => {
    const ended = { ...murka, medications: [{ ...food, ended_on: TODAY, ongoing: false }, fortiflora] }
    expect(importantFacts(ru, murka, TODAY).find((fact) => fact.label === 'Принимает сейчас')?.value).toBe('Лечебный корм · постоянно')
    expect(importantFacts(ru, ended, TODAY).find((fact) => fact.label === 'Принимает сейчас')).toBeUndefined()
    const card = sectionCards(ru, ended, TODAY).find((c) => c.section === 'medications')
    expect(card?.lines.map((line) => line.detail)).toEqual(['Завершён · 2 августа – 26 сентября', 'Завершён · 2–15 августа'])
    expect(coursesPage(ru, ended, TODAY)).toMatchObject({ subtitle: 'Мурка · Сейчас: 0 · Всего: 2', current: [] })
  })
})

describe('one course', () => {
  it('a current course can be changed and finished, asking by its name for today', () => {
    const view = courseRecord(ru, petId, food, TODAY, murka.writable)
    expect(view).toMatchObject({
      badge: 'Текущий курс',
      current: true,
      editHref: `/pets/${petId}/health/${food.id}/edit`,
      endable: true,
      removable: true,
      endTitle: 'Завершить курс «Лечебный корм»?',
    })
    expect(view.endBody).toBe('Последним днём курса будет сегодня, 26 сентября. Курс останется в истории и исчезнет из «Принимает сейчас».')
  })

  it('a finished course is only read — no «Изменить», no «Завершить курс»; it can still be deleted', () => {
    const view = courseRecord(ru, petId, fortiflora, TODAY, murka.writable)
    expect(view).toMatchObject({ badge: 'Завершён', current: false, editHref: null, endable: false, removable: true })
    expect(view.actionsBody).toBe('Курс завершён. Данные сохранены в истории и недоступны для редактирования.')
    // Ended today by the owner's day: finished at once.
    expect(courseRecord(ru, petId, { ...food, ended_on: TODAY, ongoing: false }, TODAY, murka.writable).editHref).toBeNull()
  })

  it('a course that starts later is changed or deleted, not finished', () => {
    const later = course({ started_on: '2026-10-03' })
    expect(courseRecord(ru, petId, later, TODAY, murka.writable)).toMatchObject({ endable: false, editHref: `/pets/${petId}/health/${later.id}/edit` })
  })

  it('offers no action on a server that does not store courses', () => {
    expect(courseRecord(ru, petId, food, TODAY, ['weight'])).toMatchObject({ editHref: null, endable: false, removable: false })
  })

  it('reads ?saved= strictly, and a finished course’s refusal as «done»', () => {
    expect(parseCourseSaved('ended')).toBe('ended')
    expect(parseCourseSaved('completed')).toBeNull()
    expect(eventSaveFailure(new ApiError('record_done', 409, 'finished'))).toBe('done')
    expect(ru.medicalRecord.courseForm.errors.done).toBe('Курс уже завершён, поэтому изменить его нельзя.')
  })
})

describe('dates of a course on the record’s card', () => {
  it('say the end of a current course, and a one-day course once', () => {
    const withEnd = { ...murka, medications: [course({ started_on: '2026-09-26', ended_on: '2026-10-06' })] }
    expect(sectionCards(ru, withEnd, TODAY).find((c) => c.section === 'medications')?.lines[0].detail).toBe('Сейчас · 26 сентября – 6 октября')
    expect(coursePeriod(ru, course({ started_on: TODAY, ended_on: TODAY }), TODAY)).toBe('26 сентября')
  })
})
