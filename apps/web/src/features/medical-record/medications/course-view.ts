import type { HealthOverview, HealthSection, Medication } from '@lapka/contracts'
import { canEndCourse, courseEditable, isCurrentCourse, splitCourses } from '@lapka/shared'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatRange, recordDay } from '../view-model'
import { medicalRecordHref } from '../stage'

/**
 * What the medicine pages say (web v1 «medications», «medications-empty»,
 * «course», «course-finished»), worked out from the overview — the one list
 * of courses the medical record, the pet form and the summary for the vet
 * are all read from. Which course is current is the shared rule
 * (`splitCourses`, `isCurrentCourse`), counted on the owner's own day.
 */


/**
 * «С 2 августа · постоянно», «С 2 августа», «2–15 августа», «Начнётся 3
 * октября»; a course from the pet form with nothing known says so, and no
 * date is made up.
 */
export function coursePeriod(dict: Dictionary, course: Medication, today: string): string {
  const words = dict.medicalRecord
  const period = words.coursePeriod
  const { started_on: start, ended_on: end } = course
  if (start && end) return formatRange(words, start, end, today)
  if (start) {
    const day = recordDay(words, start, today)
    if (start > today && !course.ongoing) return period.startsLater.replace('{day}', day)
    return (course.ongoing ? period.sinceOngoing : period.since).replace('{day}', day)
  }
  if (end) return period.until.replace('{day}', recordDay(words, end, today))
  if (course.ongoing) return period.ongoing
  return course.source === 'form' && !course.dosage ? period.fromForm : period.noDates
}

export type CourseCard = {
  id: string
  href: string
  title: string
  dosage: string | null
  period: string
  /** The whole card read as one link. */
  label: string
}

export type CoursesPageView = {
  subtitle: string
  current: CourseCard[]
  past: CourseCard[]
  /** No course at all: what the pet form lists, if anything, and how to add one. */
  empty: { title: string; body: string; formNames: string | null } | null
}

function card(dict: Dictionary, petId: string, course: Medication, today: string): CourseCard {
  const period = coursePeriod(dict, course, today)
  const label = dict.medicalRecord.coursesPage.cardLabel
    .replace('{name}', course.name)
    .replace('{period}', [course.dosage, period].filter(Boolean).join(', '))
  return {
    id: course.id,
    href: medicalRecordHref.recordView(petId, course.id),
    title: course.name,
    dosage: course.dosage,
    period,
    label,
  }
}

export function coursesPage(dict: Dictionary, overview: HealthOverview, today: string): CoursesPageView {
  const words = dict.medicalRecord.coursesPage
  const petId = overview.pet.id
  const { current, past } = splitCourses(overview.medications, today)
  const subtitle = words.subtitle
    .replace('{name}', overview.pet.name)
    .replace('{current}', String(current.length))
    .replace('{total}', String(overview.medications.length))
  const formNames = overview.pet.medications.filter((name) => name.trim() !== '').join(', ')
  return {
    subtitle,
    current: current.map((course) => card(dict, petId, course, today)),
    past: past.map((course) => card(dict, petId, course, today)),
    empty:
      overview.medications.length === 0
        ? { title: words.emptyTitle, body: words.emptyBody, formNames: formNames === '' ? null : formNames }
        : null,
  }
}

export type CourseRecordView = {
  title: string
  current: boolean
  badge: string
  period: string
  dosage: string | null
  sectionHref: string
  /** «Изменить»: a current course only, on a server that stores courses. */
  editHref: string | null
  /** «Завершить курс»: a begun current course. */
  endable: boolean
  removable: boolean
  actionsBody: string
  endTitle: string
  endBody: string
  deleteTitle: string
  deleteBody: string
}

export function courseRecord(
  dict: Dictionary,
  petId: string,
  course: Medication,
  today: string,
  writable: readonly HealthSection[],
): CourseRecordView {
  const words = dict.medicalRecord.courseRecord
  const canWrite = writable.includes('medications')
  const current = isCurrentCourse(course, today)
  const endable = canWrite && canEndCourse(course, today)
  return {
    title: course.name,
    current,
    badge: current ? words.currentBadge : words.finishedBadge,
    period: coursePeriod(dict, course, today),
    dosage: course.dosage,
    sectionHref: medicalRecordHref.section(petId, 'medications'),
    editHref: canWrite && courseEditable(course, today) ? medicalRecordHref.recordEdit(petId, course.id) : null,
    endable,
    removable: canWrite,
    actionsBody: !current ? words.finishedBody : endable ? words.currentBody : words.notStartedBody,
    endTitle: words.endTitle.replace('{name}', course.name),
    endBody: words.endBody.replace('{day}', recordDay(dict.medicalRecord, today, today)),
    deleteTitle: words.deleteTitle.replace('{name}', course.name),
    deleteBody: current ? words.deleteBody : words.deleteFinishedBody,
  }
}

export const COURSE_SAVED = ['added', 'changed', 'deleted', 'ended'] as const
export type CourseSaved = (typeof COURSE_SAVED)[number]

/** `?saved=` of the medicine pages, read strictly. */
export function parseCourseSaved(value: string | string[] | undefined): CourseSaved | null {
  return typeof value === 'string' && (COURSE_SAVED as readonly string[]).includes(value) ? (value as CourseSaved) : null
}
