'use client'

import type { Medication } from '@lapka/contracts'
import { courseEditable } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import { useToday } from '@/features/forms/use-today'
import type { Fresh } from '../held-record'
import { FormNotice, FormSkeleton } from '../form-parts'
import { RecordProblem } from '../MedicalRecordScreen'
import { medicalRecordHref } from '../routes'
import { DriftNotice, useHeldRecord } from '../use-held-record'
import { useMedicalRecord } from '../use-medical-record'
import CourseForm from './CourseForm'
import { courseDrift } from './course-view'

/**
 * `/pets/[id]/health/new?type=medication`: new courses, one empty to start with.
 * `today`: the owner's day from the page, the same on the server and in the
 * browser; it moves on at midnight (MW-09).
 */
export function NewCourseScreen({ petId, petName, today }: { petId: string; petName: string; today: string }) {
  const day = useToday(today)
  return <CourseForm petId={petId} petName={petName} course={null} today={day} />
}

/** What the latest load says about the course: finished by the owner's day is only read. */
function freshCourse(courses: Medication[], courseId: string, today: string): Fresh<Medication> {
  const course = courses.find((entry) => entry.id === courseId)
  if (!course) return { kind: 'gone' }
  return courseEditable(course, today) ? { kind: 'open', record: course } : { kind: 'closed' }
}

/**
 * `/pets/[id]/health/[courseId]/edit`: a current course's own values, read
 * through the v1 API. A course that is finished by the owner's day — the
 * page's server check knows only that it is not finished everywhere yet —
 * is not opened as a form: a finished course is only read (owner rule of 26
 * September 2026), and the server refuses its change anyway.
 */
export function EditCourseScreen({ petId, petName, courseId }: { petId: string; petName: string; courseId: string }) {
  const dict = useTranslations()
  const { state, reload, today } = useMedicalRecord(petId)
  // The form keeps the course it opened with while the owner types; a refresh
  // underneath — or midnight ending the course — only tells (MW-09).
  const held = useHeldRecord(state.status === 'ready' ? freshCourse(state.data.overview.medications, courseId, today) : null)

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<FormSkeleton label={dict.medicalRecord.states.loading} />} />
  }

  const course = held.record
  if (!course) {
    const found = state.data.overview.medications.find((entry) => entry.id === courseId)
    return found ? <CourseFinished petId={petId} courseId={found.id} /> : <CourseGone petId={petId} />
  }
  // Keyed by the course and the load it started from: the fields start from its values once.
  return (
    <CourseForm
      key={`${course.id}-${held.version}`}
      petId={petId}
      petName={petName}
      course={course}
      today={today}
      onDirtyChange={held.setDirty}
      notice={
        <DriftNotice
          drift={courseDrift(held.drift, course, today)}
          onTakeLatest={held.takeLatest}
          sectionHref={medicalRecordHref.section(petId, 'medications')}
          recordHref={medicalRecordHref.recordView(petId, course.id)}
        />
      }
    />
  )
}


export function CourseGone({ petId }: { petId: string }) {
  const words = useTranslations().medicalRecord.courseRecord
  return (
    <FormNotice
      id="course-gone"
      title={words.notFoundTitle}
      body={words.notFoundBody}
      href={medicalRecordHref.section(petId, 'medications')}
      action={words.back}
    />
  )
}

function CourseFinished({ petId, courseId }: { petId: string; courseId: string }) {
  const words = useTranslations().medicalRecord.courseRecord
  return (
    <FormNotice
      id="course-finished"
      title={words.finishedTitle}
      body={words.finishedFormBody}
      href={medicalRecordHref.recordView(petId, courseId)}
      action={words.openCourse}
    />
  )
}

